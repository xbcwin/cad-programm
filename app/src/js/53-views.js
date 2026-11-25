// ================= Ansichten: Schnitt, Röntgen, Explosion, Fokus-Vorschau =================
// Alles hier ändert nur, wie das Modell gezeigt wird – nie das Modell selbst. Nichts davon landet
// in der Zeitleiste oder in der Projektdatei.
const Views = (() => {
  const st = { cut: null, xray: false, ex: 0, exGoal: 0, exAnim: null, exTimer: null, exWaitOff: null, focus: null, ov: null, exGroups: false, quad: null };
  let wrap = null;   // Leisten links oben
  function bars() {
    if (!wrap || !wrap.isConnected) { wrap = h('div', { class: 'viewbars' }); $('#overlay').append(wrap); }
    return wrap;
  }
  const AX = { XY: 2, XZ: 1, YZ: 0 };
  const AXNAME = { XY: 'Z', XZ: 'Y', YZ: 'X' };
  const AXIS_TO_PLANE = { X: 'YZ', Y: 'XZ', Z: 'XY', YZ: 'YZ', XZ: 'XZ', XY: 'XY' };
  const PLANE_ORDER = ['YZ', 'XZ', 'XY'];
  const PLANE_META = {
    YZ: { axis: 'X', label: 'X · Seite', color: '#d94b4b', tip: 'Schnittebene senkrecht zur X-Achse (von der Seite, YZ)' },
    XZ: { axis: 'Y', label: 'Y · Vorne', color: '#2b9e63', tip: 'Schnittebene senkrecht zur Y-Achse (von vorne, XZ)' },
    XY: { axis: 'Z', label: 'Z · Oben', color: '#3b7dd8', tip: 'Schnittebene senkrecht zur Z-Achse (waagerecht, XY)' },
  };
  // Standard: der Teil zur Kamera hin (oben / vorne / rechts) wird weggeschnitten
  const KEEP = { XY: -1, XZ: 1, YZ: -1 };
  let hatchTex = null;
  function getHatchTex() {
    if (hatchTex) return hatchTex;
    const sz = 64, cv = document.createElement('canvas');
    cv.width = sz; cv.height = sz;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sz, sz);
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = 3.2;
    for (let d = -sz; d <= sz * 2; d += 16) {
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + sz, sz); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    hatchTex = t;
    return t;
  }
  function modelBox() {
    let b = new THREE.Box3();
    for (const id of Viewer.nodes.keys()) { const x = Viewer.baseBox(id); if (x) b.union(x); }
    if (b.isEmpty()) b = new THREE.Box3(new THREE.Vector3(-40, -40, 0), new THREE.Vector3(40, 40, 20));
    return b;
  }

  // ---------- Schnitt (bis zu drei Ebenen X/Y/Z oder Fläche, mit farbig schraffierter Kappe) ----------
  function disposeOverlayGroup(grp) {
    if (!grp) return;
    Viewer.groups.overlay.remove(grp);
    grp.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
  function disposeCutVisuals() {
    const c = st.cut; if (!c) return;
    disposeOverlayGroup(c.helper); c.helper = null;
    disposeOverlayGroup(c.capGroup); c.capGroup = null;
  }
  function activeCutEntries() {
    const c = st.cut; if (!c) return [];
    if (c.mode === 'face' && c.face) return [{ key: 'FACE', entry: c.face }];
    const out = [];
    for (const k of PLANE_ORDER) if (c.planes[k] && c.planes[k].on) out.push({ key: k, entry: c.planes[k] });
    return out;
  }
  function planeDef(key, entry) {
    if (key === 'FACE') {
      const n = entry.fn.clone().multiplyScalar(entry.flip ? 1 : -1);
      const q = entry.fp.clone().addScaledVector(entry.fn, entry.off);
      return { n, k: -n.dot(q), q };
    }
    const n = new THREE.Vector3();
    n.setComponent(AX[key], KEEP[key] * (entry.flip ? -1 : 1));
    return { n, k: -n.getComponent(AX[key]) * entry.off };
  }
  function planeFrame(n, k) {
    const q = n.clone().multiplyScalar(-k);
    const capN = n.clone().negate().normalize();
    const ref = Math.abs(capN.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const u = new THREE.Vector3().crossVectors(ref, capN).normalize();
    const v = new THREE.Vector3().crossVectors(capN, u).normalize();
    return { q, capN, u, v };
  }
  function sliceMeshWithPlane(node, n, k, frame) {
    node.obj.updateMatrixWorld(true);
    const M = node.mesh.matrixWorld, e = M.elements;
    const box = node.mesh.geometry.boundingBox;
    if (box) {
      let bMin = Infinity, bMax = -Infinity;
      for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) for (let iz = 0; iz < 2; iz++) {
        const lx = ix ? box.max.x : box.min.x, ly = iy ? box.max.y : box.min.y, lz = iz ? box.max.z : box.min.z;
        const wx = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
        const wy = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
        const wz = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
        const d = n.x * wx + n.y * wy + n.z * wz + k;
        if (d < bMin) bMin = d;
        if (d > bMax) bMax = d;
      }
      if (bMin >= -1e-4 || bMax <= 1e-4) return [];
    }
    const pos = node.mesh.geometry.getAttribute('position').array;
    const tris = node.data.triangles;
    const vCnt = pos.length / 3;
    const wx = new Float64Array(vCnt), wy = new Float64Array(vCnt), wz = new Float64Array(vCnt), dist = new Float64Array(vCnt);
    let minD = Infinity, maxD = -Infinity;
    for (let i = 0; i < vCnt; i++) {
      const lx = pos[i * 3], ly = pos[i * 3 + 1], lz = pos[i * 3 + 2];
      const X = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
      const Y = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
      const Z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
      wx[i] = X; wy[i] = Y; wz[i] = Z;
      const d = n.x * X + n.y * Y + n.z * Z + k - 1e-5;
      dist[i] = d;
      if (d < minD) minD = d;
      if (d > maxD) maxD = d;
    }
    if (minD >= -1e-4 || maxD <= 1e-4) return [];
    const { q, u, v } = frame;
    const flipW = M.determinant() < 0;
    const lerpEdge = (i, j) => {
      if (i > j) { const t = i; i = j; j = t; }
      const di = dist[i], dj = dist[j], denom = di - dj;
      const t = Math.abs(denom) < 1e-12 ? 0.5 : clamp(di / denom, 0, 1);
      const px = wx[i] + (wx[j] - wx[i]) * t - q.x;
      const py = wy[i] + (wy[j] - wy[i]) * t - q.y;
      const pz = wz[i] + (wz[j] - wz[i]) * t - q.z;
      return [u.x * px + u.y * py + u.z * pz, v.x * px + v.y * py + v.z * pz];
    };
    const segs = [];
    for (let t = 0; t + 2 < tris.length; t += 3) {
      const i0 = tris[t], i1 = tris[t + 1], i2 = tris[t + 2];
      const mask = (dist[i0] >= 0 ? 1 : 0) | (dist[i1] >= 0 ? 2 : 0) | (dist[i2] >= 0 ? 4 : 0);
      if (mask === 0 || mask === 7) continue;
      let a, b;
      if (mask === 1) { a = lerpEdge(i2, i0); b = lerpEdge(i0, i1); }
      else if (mask === 2) { a = lerpEdge(i0, i1); b = lerpEdge(i1, i2); }
      else if (mask === 4) { a = lerpEdge(i1, i2); b = lerpEdge(i2, i0); }
      else if (mask === 6) { a = lerpEdge(i0, i1); b = lerpEdge(i2, i0); }
      else if (mask === 5) { a = lerpEdge(i1, i2); b = lerpEdge(i0, i1); }
      else { a = lerpEdge(i2, i0); b = lerpEdge(i1, i2); }
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (dx * dx + dy * dy < 1e-12) continue;
      segs.push(flipW ? [b, a] : [a, b]);
    }
    return segs;
  }
  function polyArea2D(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a * 0.5;
  }
  function pointInPoly2D(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function cleanLoop(raw) {
    const pts = [];
    for (const p of raw) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-5) pts.push(p);
    }
    if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 1e-5) pts.pop();
    if (pts.length < 3) return [];
    const simp = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length], cur = pts[i], next = pts[(i + 1) % pts.length];
      const ax = cur[0] - prev[0], ay = cur[1] - prev[1], bx = next[0] - cur[0], by = next[1] - cur[1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la > 1e-7 && lb > 1e-7 && Math.abs(ax * by - ay * bx) <= 1e-7 * la * lb && ax * bx + ay * by > 0) continue;
      simp.push(cur);
    }
    return simp.length >= 3 ? simp : pts;
  }
  function chainLoops(segs) {
    if (!segs.length) return [];
    const scale = 1000, tol2 = 2.5e-5; // 5e-3 mm
    const startMap = new Map(), endMap = new Map();
    const keyOf = (x, y) => Math.round(x * scale) + ',' + Math.round(y * scale);
    const addMap = (m, p, idx) => { const k = keyOf(p[0], p[1]); let arr = m.get(k); if (!arr) { arr = []; m.set(k, arr); } arr.push(idx); };
    for (let i = 0; i < segs.length; i++) { addMap(startMap, segs[i][0], i); addMap(endMap, segs[i][1], i); }
    const used = new Uint8Array(segs.length);
    const findNext = (pt, map, endIdx) => {
      const gx = Math.round(pt[0] * scale), gy = Math.round(pt[1] * scale);
      let best = -1, bd = tol2;
      for (let dx = -5; dx <= 5; dx++) for (let dy = -5; dy <= 5; dy++) {
        const arr = map.get((gx + dx) + ',' + (gy + dy));
        if (!arr) continue;
        for (const i of arr) {
          if (used[i]) continue;
          const p = segs[i][endIdx];
          const d2 = (p[0] - pt[0]) ** 2 + (p[1] - pt[1]) ** 2;
          if (d2 < bd) { bd = d2; best = i; }
        }
      }
      return best;
    };
    const loops = [];
    for (let s = 0; s < segs.length; s++) {
      if (used[s]) continue;
      used[s] = 1;
      const raw = [segs[s][0], segs[s][1]];
      let guard = segs.length + 2;
      while (guard-- > 0) {
        const tail = raw[raw.length - 1];
        if (raw.length >= 3 && (tail[0] - raw[0][0]) ** 2 + (tail[1] - raw[0][1]) ** 2 < tol2) break;
        let nx = findNext(tail, startMap, 0);
        if (nx >= 0) { used[nx] = 1; raw.push(segs[nx][1]); continue; }
        nx = findNext(tail, endMap, 1);
        if (nx >= 0) { used[nx] = 1; raw.push(segs[nx][0]); continue; }
        break;
      }
      if (raw.length >= 3 && Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < 0.05) {
        const pts = cleanLoop(raw);
        if (pts.length >= 3 && Math.abs(polyArea2D(pts)) > 1e-4) loops.push(pts);
      }
    }
    return loops;
  }
  function triangulateLoops(loops) {
    if (!loops.length) return { verts: [], tris: [], area: 0 };
    const items = loops.map((pts) => { const a = polyArea2D(pts); return { pts, absA: Math.abs(a), signedA: a }; });
    const depth = new Int32Array(items.length);
    const parent = new Int32Array(items.length).fill(-1);
    for (let i = 0; i < items.length; i++) {
      const p0 = items[i].pts[0];
      let d = 0;
      for (let j = 0; j < items.length; j++) {
        if (i === j || items[j].absA <= items[i].absA) continue;
        if (pointInPoly2D(p0[0], p0[1], items[j].pts)) d++;
      }
      depth[i] = d;
    }
    for (let i = 0; i < items.length; i++) {
      if (depth[i] % 2 === 1) {
        let best = -1, bestA = Infinity;
        const p0 = items[i].pts[0];
        for (let j = 0; j < items.length; j++) {
          if (i === j || depth[j] !== depth[i] - 1 || items[j].absA <= items[i].absA) continue;
          if (items[j].absA < bestA && pointInPoly2D(p0[0], p0[1], items[j].pts)) { bestA = items[j].absA; best = j; }
        }
        parent[i] = best;
      }
    }
    const verts = [], tris = [];
    let area = 0;
    for (let i = 0; i < items.length; i++) {
      if (depth[i] % 2 !== 0) continue;
      const outer = items[i].signedA >= 0 ? items[i].pts.slice() : items[i].pts.slice().reverse();
      const holes = [];
      let outerA = items[i].absA;
      for (let j = 0; j < items.length; j++) {
        if (parent[j] !== i) continue;
        const hPts = items[j].signedA <= 0 ? items[j].pts.slice() : items[j].pts.slice().reverse();
        holes.push(hPts);
        outerA -= items[j].absA;
      }
      const cV2 = outer.map((p) => new THREE.Vector2(p[0], p[1]));
      const hV2 = holes.map((hl) => hl.map((p) => new THREE.Vector2(p[0], p[1])));
      let faces = null;
      try { faces = THREE.ShapeUtils.triangulateShape(cV2, hV2); } catch (_) { faces = null; }
      if (!faces || !faces.length) continue;
      const baseIdx = verts.length;
      for (const p of outer) verts.push(p);
      for (const hl of holes) for (const p of hl) verts.push(p);
      for (const f of faces) tris.push(baseIdx + f[0], baseIdx + f[1], baseIdx + f[2]);
      area += Math.max(0, outerA);
    }
    return { verts, tris, area };
  }
  function capColorOf(n) {
    const baseHex = (n.look && n.look.matCol) || n.color || '#2f9e91';
    const c = new THREE.Color(baseHex);
    const hsl = {};
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), clamp(hsl.l * 0.9 + 0.08, 0.28, 0.78));
    return c;
  }
  function drawCutCaps() {
    const c = st.cut; if (!c) return;
    disposeOverlayGroup(c.capGroup); c.capGroup = null;
    c.capArea = 0; c.capCount = 0;
    const entries = activeCutEntries();
    if (!c.cap || !entries.length) { updateCutInfo(); Viewer.requestRender(); return; }
    const grp = new THREE.Group();
    grp.name = 'section-caps';
    grp.userData.sectionCap = true;
    const allObjs = entries.map((x) => x.entry.obj).filter(Boolean);
    const solids = [...Viewer.nodes.values()].filter((n) => n.obj.visible && n.role !== 'hole' && n.mesh && n.data && n.data.triangles);
    const box = modelBox();
    const uvScale = 1 / clamp(box.getSize(new THREE.Vector3()).length() * 0.09, 2, 18);
    const tex = getHatchTex();
    let totalArea = 0, meshCount = 0;
    for (const { key, entry } of entries) {
      const { n, k } = planeDef(key, entry);
      const frame = planeFrame(n, k);
      const { q, capN, u, v } = frame;
      const otherPlanes = allObjs.filter((pl) => pl !== entry.obj);
      solids.forEach((node, ni) => {
        const segs = sliceMeshWithPlane(node, n, k, frame);
        if (!segs.length) return;
        const loops = chainLoops(segs);
        if (!loops.length) return;
        const { verts, tris, area } = triangulateLoops(loops);
        if (!tris.length) return;
        totalArea += area;
        const pos = new Float32Array(verts.length * 3), norm = new Float32Array(verts.length * 3), uv = new Float32Array(verts.length * 2);
        const flipU = ni % 2 === 1 ? -1 : 1;
        for (let i = 0; i < verts.length; i++) {
          const uu = verts[i][0], vv = verts[i][1];
          pos[i * 3] = q.x + u.x * uu + v.x * vv;
          pos[i * 3 + 1] = q.y + u.y * uu + v.y * vv;
          pos[i * 3 + 2] = q.z + u.z * uu + v.z * vv;
          norm[i * 3] = capN.x; norm[i * 3 + 1] = capN.y; norm[i * 3 + 2] = capN.z;
          uv[i * 2] = uu * flipU * uvScale; uv[i * 2 + 1] = vv * uvScale;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(tris);
        const capCol = capColorOf(node);
        const mat = new THREE.MeshBasicMaterial({
          color: capCol, map: tex, side: THREE.DoubleSide,
          clippingPlanes: otherPlanes.length ? otherPlanes : null,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 16;
        mesh.userData = { sectionCap: true, planeKey: key, nodeId: node.id };
        grp.add(mesh);
        meshCount++;
        const outPos = [];
        for (const lp of loops) {
          for (let i = 0; i < lp.length; i++) {
            const p0 = lp[i], p1 = lp[(i + 1) % lp.length];
            outPos.push(
              q.x + u.x * p0[0] + v.x * p0[1], q.y + u.y * p0[0] + v.y * p0[1], q.z + u.z * p0[0] + v.z * p0[1],
              q.x + u.x * p1[0] + v.x * p1[1], q.y + u.y * p1[0] + v.y * p1[1], q.z + u.z * p1[0] + v.z * p1[1],
            );
          }
        }
        if (outPos.length) {
          const og = new THREE.BufferGeometry();
          og.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
          const om = new THREE.LineBasicMaterial({ color: capCol.clone().multiplyScalar(0.5), clippingPlanes: otherPlanes.length ? otherPlanes : null });
          const ol = new THREE.LineSegments(og, om);
          ol.renderOrder = 17;
          ol.userData = { sectionCapOutline: true, planeKey: key, nodeId: node.id };
          grp.add(ol);
        }
      });
    }
    c.capArea = totalArea;
    c.capCount = meshCount;
    if (grp.children.length) { Viewer.groups.overlay.add(grp); c.capGroup = grp; }
    updateCutInfo();
    Viewer.requestRender();
  }
  function updateCutInfo() {
    const c = st.cut; if (!c || !c.bar) return;
    const el = c.bar.querySelector('#cut-info'); if (!el) return;
    const n = activeCutEntries().length;
    if (!c.cap) { el.textContent = 'Kappe ausgeblendet'; return; }
    if (n > 1) { el.textContent = `${n} Ebenen aktiv · schraffiert = Schnittfläche`; return; }
    el.textContent = c.capArea > 0.05 ? `Schnittfläche ${Units.fmtAreaU(c.capArea, c.capArea < 100 ? 1 : 0)}` : 'Schraffiert = Schnittfläche';
  }
  function applyCut() {
    const c = st.cut;
    if (!c) { disposeCutVisuals(); Viewer.setClip(null); return; }
    const entries = activeCutEntries();
    const planeObjs = [];
    let primary = null;
    for (const { key, entry } of entries) {
      const { n, k } = planeDef(key, entry);
      if (!entry.obj) entry.obj = new THREE.Plane(n, k);
      else { entry.obj.normal.copy(n); entry.obj.constant = k; }
      planeObjs.push(entry.obj);
      if (key === c.active || (c.mode === 'face' && key === 'FACE')) primary = entry.obj;
    }
    if (!primary && planeObjs.length) primary = planeObjs[0];
    Viewer.setClip(planeObjs, { primary, cap: c.cap });
    drawCutHelper();
    drawCutCaps();
  }
  function drawCutHelper() {
    const c = st.cut; if (!c) return;
    disposeOverlayGroup(c.helper); c.helper = null;
    const entries = activeCutEntries();
    if (!entries.length) { Viewer.requestRender(); return; }
    const b = modelBox(); const pad = Math.max(4, b.getSize(new THREE.Vector3()).length() * 0.08);
    const grp = new THREE.Group();
    grp.userData.sectionHelper = true;
    for (const { key, entry } of entries) {
      let corners;
      if (key === 'FACE') {
        const { q } = planeDef('FACE', entry); const n = entry.fn; const R = b.getSize(new THREE.Vector3()).length() / 2 + pad;
        const u = new THREE.Vector3(Math.abs(n.z) > 0.9 ? 1 : 0, 0, Math.abs(n.z) > 0.9 ? 0 : 1).cross(n).normalize(), v = new THREE.Vector3().crossVectors(n, u);
        corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, bb]) => q.clone().addScaledVector(u, a * R).addScaledVector(v, bb * R));
      } else {
        const ax = AX[key]; const u = [0, 1, 2].filter((i) => i !== ax);
        const lo = b.min.clone().subScalar(pad), hi = b.max.clone().addScalar(pad);
        const P = (a, bb) => { const v = new THREE.Vector3(); v.setComponent(ax, entry.off); v.setComponent(u[0], a); v.setComponent(u[1], bb); return v; };
        corners = [P(lo.getComponent(u[0]), lo.getComponent(u[1])), P(hi.getComponent(u[0]), lo.getComponent(u[1])), P(hi.getComponent(u[0]), hi.getComponent(u[1])), P(lo.getComponent(u[0]), hi.getComponent(u[1]))];
      }
      const col = new THREE.Color(key === 'FACE' ? Viewer.theme.accent : PLANE_META[key].color);
      const fill = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false }));
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.72 }));
      fill.renderOrder = 20; line.renderOrder = 21;
      grp.add(fill, line);
    }
    grp.renderOrder = 20;
    Viewer.groups.overlay.add(grp); c.helper = grp; Viewer.requestRender();
  }
  function makeCutState() {
    const b = modelBox();
    const mid = (k) => round((b.min.getComponent(AX[k]) + b.max.getComponent(AX[k])) / 2, 2);
    return {
      mode: 'axes',
      planes: {
        YZ: { on: false, off: mid('YZ'), flip: false, obj: null },
        XZ: { on: false, off: mid('XZ'), flip: false, obj: null },
        XY: { on: false, off: mid('XY'), flip: false, obj: null },
      },
      active: 'XZ',
      face: null,
      cap: true,
      capArea: 0,
      capCount: 0,
      helper: null,
      capGroup: null,
      bar: null,
    };
  }
  function section(on = !st.cut, opts = {}) {
    if (!on) {
      if (!st.cut) return;
      disposeCutVisuals();
      if (st.cut.bar) st.cut.bar.remove();
      st.cut = null; applyCut(); sync(); return;
    }
    const b = modelBox();
    const mid = (k) => round((b.min.getComponent(AX[k]) + b.max.getComponent(AX[k])) / 2, 2);
    if (!st.cut) st.cut = makeCutState();
    const c = st.cut;
    if (opts.cap !== undefined) c.cap = !!opts.cap;
    if (opts.face) {
      const f = opts.face, W = Model.worldMatrix(App.doc, f.id);
      const fn = new THREE.Vector3(...f.info.n).transformDirection(W).normalize(), fp = new THREE.Vector3(...f.info.c).applyMatrix4(W);
      c.mode = 'face';
      c.face = { fn, fp, off: opts.off != null ? opts.off : -1, flip: !!opts.flip, obj: c.face && c.face.obj };
      c.active = 'FACE';
      applyCut(); cutBar(); sync(); return;
    }
    if (opts.toggle) {
      const k = AXIS_TO_PLANE[opts.toggle] || 'XZ';
      if (c.mode === 'face') {
        c.mode = 'axes';
        for (const p of PLANE_ORDER) c.planes[p].on = (p === k);
        c.planes[k].off = opts.off != null ? opts.off : mid(k);
        c.planes[k].flip = !!opts.flip;
        c.active = k;
      } else if (c.planes[k].on) {
        const activeCount = PLANE_ORDER.filter((p) => c.planes[p].on).length;
        if (activeCount <= 1) {
          UI.toast('Mindestens eine Schnittebene bleibt aktiv – × oder C beendet den Schnitt.', { icon: 'info', ms: 2400 });
          return;
        }
        c.planes[k].on = false;
        if (c.active === k) c.active = PLANE_ORDER.find((p) => c.planes[p].on) || k;
      } else {
        c.planes[k].on = true;
        c.planes[k].off = opts.off != null ? opts.off : mid(k);
        c.planes[k].flip = !!opts.flip;
        c.active = k;
      }
      applyCut(); cutBar(); sync(); return;
    }
    if (Array.isArray(opts.planes) && opts.planes.length) {
      c.mode = 'axes';
      for (const p of PLANE_ORDER) c.planes[p].on = false;
      let first = null;
      for (const spec of opts.planes) {
        const raw = typeof spec === 'string' ? spec : (spec.plane || spec.axis);
        const k = AXIS_TO_PLANE[raw]; if (!k) continue;
        c.planes[k].on = true;
        c.planes[k].off = typeof spec === 'object' && spec.off != null ? spec.off : mid(k);
        c.planes[k].flip = typeof spec === 'object' ? !!spec.flip : false;
        if (!first) first = k;
      }
      c.active = first || 'XZ';
      if (!first) c.planes.XZ.on = true;
      applyCut(); cutBar(); sync(); return;
    }
    const plane = AXIS_TO_PLANE[opts.plane] || (c.mode === 'axes' && c.active !== 'FACE' ? c.active : 'XZ');
    c.mode = 'axes';
    for (const p of PLANE_ORDER) c.planes[p].on = (p === plane);
    c.planes[plane].off = opts.off != null ? opts.off : mid(plane);
    c.planes[plane].flip = !!opts.flip;
    c.active = plane;
    applyCut(); cutBar(); sync();
  }
  function cutBar() {
    const c = st.cut; if (!c) return;
    if (c.bar) c.bar.remove();
    const entries = activeCutEntries();
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Schnitt' });
    const titleTxt = entries.length > 1 ? `Schnitt · ${entries.length} Ebenen` : 'Schnitt';
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, titleTxt));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Schnitt beenden', 'data-tip': 'Schnitt beenden (C)' }); close.innerHTML = icon('close'); close.onclick = () => section(false);
    head.append(close);
    const seg = h('div', { class: 'seg' + (c.mode === 'face' ? ' cut-has-face' : ''), role: 'group', 'aria-label': 'Schnittebenen (einzeln an/aus)' });
    for (const k of PLANE_ORDER) {
      const m = PLANE_META[k], on = c.mode === 'axes' && c.planes[k].on;
      const dot = h('span', { class: 'cut-dot', style: { background: m.color } });
      const x = h('button', { type: 'button', 'aria-pressed': on ? 'true' : 'false', 'data-plane': k, 'data-axis': m.axis, 'data-tip': m.tip }, dot, m.label);
      x.onclick = () => section(true, { toggle: k });
      seg.append(x);
    }
    if (c.mode === 'face') seg.append(h('button', { type: 'button', 'aria-pressed': 'true', 'data-plane': 'FACE', 'data-tip': 'Parallel zur gewählten Fläche' }, 'An Fläche'));
    bar.append(head, seg);
    const b = modelBox();
    const span = Math.ceil(b.getSize(new THREE.Vector3()).length());
    const focusPlane = (k) => {
      if (c.active === k) return;
      c.active = k;
      bar.querySelectorAll('.cut-row').forEach((r) => {
        const isF = r.dataset.rowPlane === k;
        r.classList.toggle('is-active', isF);
        const rng = r.querySelector('[data-cut-range]'), nm = r.querySelector('[data-cut-off]'), fl = r.querySelector('[data-cut-flip]');
        if (rng) { if (isF) rng.id = 'cut-range'; else if (rng.id === 'cut-range') rng.removeAttribute('id'); }
        if (nm) { if (isF) nm.id = 'cut-off'; else if (nm.id === 'cut-off') nm.removeAttribute('id'); }
        if (fl) { if (isF) fl.id = 'cut-flip'; else if (fl.id === 'cut-flip') fl.removeAttribute('id'); }
      });
      const entry = k === 'FACE' ? c.face : c.planes[k];
      if (entry && entry.obj) {
        const all = activeCutEntries().map((x) => x.entry.obj).filter(Boolean);
        Viewer.setClip(all, { primary: entry.obj, cap: c.cap });
      }
    };
    for (const { key, entry } of entries) {
      const isF = key === c.active || (c.mode === 'face' && key === 'FACE');
      const ax = key === 'FACE' ? null : AX[key];
      const lo = key === 'FACE' ? -span : Math.floor(b.min.getComponent(ax) - 1);
      const hi = key === 'FACE' ? span : Math.ceil(b.max.getComponent(ax) + 1);
      const range = h('input', { type: 'range', ...(isF ? { id: 'cut-range' } : {}), 'data-cut-range': key, min: lo, max: hi, step: 0.1, value: entry.off, 'aria-label': `Lage ${key === 'FACE' ? 'Fläche' : PLANE_META[key].axis}` });
      const num = h('input', { type: 'text', ...(isF ? { id: 'cut-off' } : {}), 'data-cut-off': key, class: 'vb-num', inputmode: 'decimal', value: Units.fmtInput(entry.off), 'aria-label': `Lage in ${Units.label()}` });
      const set = (v) => {
        if (!isFinite(v)) return;
        entry.off = v;
        focusPlane(key);
        applyCut();
        range.value = v;
        if (document.activeElement !== num) num.value = Units.fmtInput(v);
      };
      range.oninput = () => set(+range.value);
      num.onfocus = () => focusPlane(key);
      num.onkeydown = (e) => { if (e.key === 'Enter') { const p = Units.parseLen(num.value, Model.vars(App.doc).v, { expr: false }); if (p.ok) set(p.num); num.blur(); } e.stopPropagation(); };
      num.onchange = () => { const p = Units.parseLen(num.value, Model.vars(App.doc).v, { expr: false }); if (p.ok) set(p.num); };
      const flip = h('button', { type: 'button', class: 'btn small cut-flip-btn', ...(isF ? { id: 'cut-flip' } : {}), 'data-cut-flip': key, 'aria-pressed': entry.flip ? 'true' : 'false', 'data-tip': 'Die andere Hälfte zeigen' });
      flip.innerHTML = entries.length > 1 ? icon('mirror') : icon('mirror') + 'Umdrehen';
      flip.onclick = () => { entry.flip = !entry.flip; flip.setAttribute('aria-pressed', entry.flip ? 'true' : 'false'); focusPlane(key); applyCut(); };
      const lbl = h('span', { class: 'vb-l cut-badge', style: key === 'FACE' ? {} : { color: PLANE_META[key].color } }, key === 'FACE' ? '↕' : PLANE_META[key].axis);
      const row = h('div', { class: 'vb-row cut-row' + (isF ? ' is-active' : ''), 'data-row-plane': key, 'data-axis': key === 'FACE' ? 'FACE' : PLANE_META[key].axis }, lbl, range, num, h('span', { class: 'vb-u' }, Units.label()), flip);
      bar.append(row);
    }
    const capCb = h('input', { type: 'checkbox', id: 'cut-cap' }); capCb.checked = !!c.cap;
    capCb.onchange = () => { c.cap = capCb.checked; applyCut(); };
    const capLbl = h('label', { class: 'vb-hint cut-cap-lbl', 'data-tip': 'Geschnittene Flächen farbig und schraffiert füllen' }, capCb, ' Kappe füllen');
    const info = h('span', { class: 'vb-hint', id: 'cut-info' }, '');
    bar.append(h('div', { class: 'vb-row cut-foot' }, capLbl, info));
    bars().prepend(bar); c.bar = bar;
    updateCutInfo();
  }
  function parseNum(s) { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : null; }

  // ---------- Röntgen ----------
  function xray(on = !st.xray) {
    st.xray = !!on; Viewer.setXray(st.xray); sync();
    if (st.xray) UI.toast('Röntgen an: Körper werden durchsichtig. Ein zweiter Klick wählt das Teil dahinter.', { icon: 'info', ms: 3200 });
  }

  // ---------- Explosion ----------
  // Teile rücken waagerecht von der Mitte weg. Übereinanderliegende Schichten (gleiche Unterkante)
  // werden nach oben auseinandergezogen, jede um die Höhe der Schichten darunter – wie in einer Bauanleitung.
  // Ein Teil der Szene (auch die einzeln gezeigten Teile aus Gruppen)
  const sceneItem = (id) => App.doc.items.find((x) => x.id === id) || App.extra.find((x) => x.id === id);
  const shown = (id) => { const it = sceneItem(id); return it && !it.hidden && it.role !== 'hole' && !App.hideIds.has(id); };
  // Gruppen zerlegen: jedes Teil einer Gruppe (eine Ebene tief) wird einzeln gezeigt – samt den Löchern der Gruppe,
  // damit die Bohrungen nicht fehlen. Muster- und Rechen-Gruppen bleiben ganz.
  function splitGroups() {
    const extra = [], hide = new Set();
    for (const g of Model.activeItems(App.doc)) {
      if (g.kind !== 'group' || g.hidden || (g.p && g.p.op)) continue;
      const kids = (g.children || []).filter((c) => !c.suppressed && !c.hidden);
      const solids = kids.filter((c) => c.role !== 'hole'), holes = kids.filter((c) => c.role === 'hole');
      if (solids.length < 2) continue;
      hide.add(g.id);
      for (const c of solids) extra.push({ id: '__ex:' + c.id, kind: 'group', name: c.name, role: 'solid', color: c.color || g.color, mat: c.mat || g.mat, t: deepClone(g.t || Model.T0()), p: {}, finishes: [], children: [deepClone(c), ...holes.map(deepClone)] });
    }
    return { extra, hide };
  }
  function setGroups(on) {
    st.exGroups = !!on;
    const { extra, hide } = on ? splitGroups() : { extra: [], hide: new Set() };
    App.extra = extra; App.hideIds = hide;
    App.rebuild();
    const cb = st.exBar && st.exBar.querySelector('#ex-groups'); if (cb) cb.checked = st.exGroups;
  }
  const groupsSplittable = () => splitGroups().extra.length > 0;
  function offsets(f) {
    const ids = [...Viewer.nodes.keys()].filter(shown);
    const boxes = ids.map((id) => [id, Viewer.baseBox(id)]).filter((x) => x[1]);
    const all = new THREE.Box3(); for (const [, b] of boxes) all.union(b);
    const C = all.getCenter(new THREE.Vector3()); const S = Math.max(10, all.getSize(new THREE.Vector3()).length());
    // Schichten nach Unterkante
    const sorted = boxes.slice().sort((a, b) => a[1].min.z - b[1].min.z);
    const layerOf = new Map(); const layers = [];
    for (const [id, b] of sorted) {
      let L = layers[layers.length - 1];
      if (!L || b.min.z - L.z > 0.5) { L = { z: b.min.z, h: 0 }; layers.push(L); }
      L.h = Math.max(L.h, b.max.z - b.min.z); layerOf.set(id, layers.length - 1);
    }
    const lift = [0]; for (let i = 1; i < layers.length; i++) lift[i] = lift[i - 1] + layers[i - 1].h + S * 0.08;
    const map = new Map();
    for (const [id, b] of boxes) {
      const c = b.getCenter(new THREE.Vector3());
      map.set(id, new THREE.Vector3((c.x - C.x) * f * 1.2, (c.y - C.y) * f * 1.2, lift[layerOf.get(id)] * f));
    }
    // Löcher der obersten Ebene wandern mit dem Teil, das sie schneiden
    for (const id of Viewer.nodes.keys()) {
      if (map.has(id)) continue;
      const hb = Viewer.baseBox(id); if (!hb) continue;
      const host = boxes.find(([, b]) => b.intersectsBox(hb)); if (host) map.set(id, map.get(host[0]).clone());
    }
    return map;
  }
  function stopExAnim() {
    if (st.exAnim) { cancelAnimationFrame(st.exAnim); st.exAnim = null; }
    if (st.exTimer) { clearTimeout(st.exTimer); st.exTimer = null; }
  }
  function explodeCount() { return [...Viewer.nodes.keys()].filter(shown).length; }
  function explode(on = st.exGoal === 0, amount = 0.6) {
    if (st.exWaitOff) { st.exWaitOff(); st.exWaitOff = null; }
    if (on && explodeCount() < 2) {
      // Nur ein Teil ganz oben, aber eine Gruppe mit mehreren Teilen: dann die Gruppen gleich mit zerlegen
      if (!groupsSplittable()) { UI.toast('Zum Auseinanderziehen braucht es mindestens zwei Teile.', { icon: 'info', ms: 4200 }); return; }
      st.exGoal = amount;
      setGroups(true);
      const off = App.on('results', () => { off(); if (st.exWaitOff === off) st.exWaitOff = null; if (st.exGoal > 0) animateTo(amount); });
      st.exWaitOff = off;
      exBar(); App.select(App.sel); return;
    }
    animateTo(on ? amount : 0);
    if (on) { exBar(); App.select(App.sel); }   // Griffe ausblenden
  }
  function animateTo(goal, ms = 450) {
    st.exGoal = goal; const from = st.ex, t0 = performance.now();
    stopExAnim();
    const step = () => {
      stopExAnim();
      const elapsed = performance.now() - t0;
      const t = ms > 0 ? Math.min(1, elapsed / ms) : 1;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setEx(from + (goal - from) * e, true);
      if (t < 1) {
        st.exAnim = requestAnimationFrame(step);
        st.exTimer = setTimeout(step, Math.max(16, Math.min(50, ms - elapsed + 16)));
      } else {
        if (goal === 0) { Viewer.setOffsets(null); if (st.exBar) { st.exBar.remove(); st.exBar = null; } if (st.exGroups) setGroups(false); Handles.rebuild(); Panels.renderCtx(); }
        if (st.cut) drawCutCaps();
        sync();
      }
    };
    step();
  }
  function setEx(f, animating = false) {
    st.ex = f; Viewer.setOffsets(f > 1e-4 ? offsets(f) : null);
    if (st.cut && !animating && !st.exAnim && !st.exTimer) drawCutCaps();
    if (st.exBar) { const r = st.exBar.querySelector('#ex-range'); if (r && document.activeElement !== r) r.value = Math.round(f * 100); }
  }
  function exBar() {
    if (st.exBar) return;
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Explosion' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Explosion'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Wieder zusammensetzen', 'data-tip': 'Wieder zusammensetzen' }); close.innerHTML = icon('close'); close.onclick = () => explode(false);
    head.append(close);
    const range = h('input', { type: 'range', id: 'ex-range', min: 0, max: 100, step: 1, value: Math.round(st.exGoal * 100), 'aria-label': 'Wie weit auseinander' });
    range.oninput = () => { stopExAnim(); st.exGoal = +range.value / 100; setEx(st.exGoal); sync(); };
    const back = h('button', { type: 'button', class: 'btn small', id: 'ex-back' }); back.innerHTML = icon('group') + 'Zusammensetzen';
    back.onclick = () => explode(false);
    const gcb = h('input', { type: 'checkbox', id: 'ex-groups' }); gcb.checked = st.exGroups;
    gcb.onchange = () => setGroups(gcb.checked);
    const grow = h('div', { class: 'vb-row' }, h('label', { class: 'vb-hint' }, gcb, ' Gruppen auch zerlegen'));
    if (!st.exGroups && !groupsSplittable()) grow.hidden = true;
    bar.append(head, h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Weit'), range), grow, h('div', { class: 'vb-row' }, back, h('span', { class: 'vb-hint' }, 'Teile anklicken und rechts ändern geht weiter')));
    const fv = bars().querySelector('.focusview'); fv ? bars().insertBefore(bar, fv) : bars().append(bar); st.exBar = bar;
  }
  // Zum Zeichnen, Bohren, Messen oder Ziehen muss alles wieder an seinem Platz sein
  function collapse() { if (st.exGoal > 0 || st.ex > 0) animateTo(0, 250); }

  // ---------- Fokus-Vorschau ----------
  function stopFocusTimer(f) {
    if (f && f.drawTimer) { clearTimeout(f.drawTimer); f.drawTimer = null; }
  }
  function requestFocusDraw() {
    const f = st.focus; if (!f) return;
    Viewer.requestRender();
    if (!f.ids.length) { f.dirty = false; stopFocusTimer(f); return; }
    f.dirty = true;
    stopFocusTimer(f);
    // Timer-Fallback bei blockiertem requestAnimationFrame (wie in animateTo/Viewer)
    f.drawTimer = setTimeout(() => {
      f.drawTimer = null;
      if (st.focus === f && f.dirty && f.ids.length) Viewer.renderNow();
    }, 60);
  }
  function focus(on = !st.focus) {
    if (!on) { if (st.focus) { st.focus.el.remove(); st.focus.off(); st.focus = null; Viewer.requestRender(); } sync(); return; }
    if (st.focus) return;
    const el = h('div', { class: 'focusview', role: 'region', 'aria-label': 'Fokus-Vorschau' });
    const head = h('div', { class: 'fv-head' }, h('span', { class: 'fv-title' }, 'Fokus'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Fokus-Vorschau schließen' }); close.innerHTML = icon('close'); close.onclick = () => focus(false);
    head.append(close);
    const body = h('div', { class: 'fv-body', 'data-tip': 'Ziehen dreht nur diese Vorschau · Doppelklick: wie die große Ansicht' });
    const empty = h('div', { class: 'fv-empty' }, 'Wähle ein Teil – es erscheint hier groß.');
    body.append(empty); el.append(head, body);
    bars().append(el);
    const f = { el, body, empty, title: head.firstChild, rot: [0, 0], ids: [], drawn: false, dirty: false, drawTimer: null };
    let drag = null;
    body.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, r: f.rot.slice() }; try { body.setPointerCapture(e.pointerId); } catch (_) {} e.stopPropagation(); });
    body.addEventListener('pointermove', (e) => { if (!drag) return; f.rot = [drag.r[0] - (e.clientX - drag.x) * 0.6, clamp(drag.r[1] + (e.clientY - drag.y) * 0.5, -80, 80)]; requestFocusDraw(); });
    body.addEventListener('pointerup', () => { drag = null; });
    body.addEventListener('dblclick', () => { f.rot = [0, 0]; requestFocusDraw(); });
    body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    const offR = Viewer.on('afterRender', () => drawFocus());
    const offS = App.on('selection', () => { refreshFocus(); requestFocusDraw(); });
    const offD = App.on('results', () => { refreshFocus(); requestFocusDraw(); });
    f.off = () => { stopFocusTimer(f); offR && offR(); offS && offS(); offD && offD(); };
    st.focus = f; refreshFocus(); requestFocusDraw(); sync();
  }
  function refreshFocus() {
    const f = st.focus; if (!f) return;
    const ids = []; for (const id of App.sel) { const t = Model.topOf(App.doc, id); if (t && Viewer.nodes.has(t.id) && !ids.includes(t.id)) ids.push(t.id); }
    const same = ids.length === f.ids.length && ids.every((id, i) => id === f.ids[i]);
    f.ids = ids;
    if (!ids.length || !same) f.drawn = false;
    const name = ids.length === 1 ? Model.label(App.doc.items.find((x) => x.id === ids[0])) : ids.length ? ids.length + ' Teile' : '';
    f.title.textContent = name ? 'Fokus · ' + name : 'Fokus';
    f.empty.hidden = !!ids.length;
  }
  function drawFocus() {
    const f = st.focus; if (!f) return;
    stopFocusTimer(f);
    f.dirty = false;
    if (!f.ids.length) { f.drawn = false; return; }
    const cr = Viewer.canvas.getBoundingClientRect(), br = f.body.getBoundingClientRect();
    f.drawn = Viewer.renderInset({ x: br.left - cr.left, y: br.top - cr.top, w: br.width, h: br.height }, f.ids, f.rot);
  }

  // ---------- Überhänge (3D-Druck) ----------
  // Flächen, die steiler als der Grenzwinkel nach unten zeigen und nicht auf dem Druckbett liegen, werden rot.
  // Druckbett = Unterseite aller sichtbaren Körper. Nur Anzeige, ändert nichts am Modell.
  function overhangData(angle, only) {
    const lim = -Math.cos((angle * Math.PI) / 180);
    const all = [...Viewer.nodes.values()].filter((n) => n.obj.visible && n.role !== 'hole' && n.mesh && n.data && n.data.triangles);
    const solids = only ? all.filter((n) => only.includes(n.id)) : all;
    for (const n of solids) n.obj.updateMatrixWorld(true);
    let bed = Infinity;
    for (const n of all) { n.obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(n.mesh); if (!b.isEmpty()) bed = Math.min(bed, b.min.z); }
    const out = []; let area = 0, cx = 0, cy = 0, cz = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3(), nn = new THREE.Vector3();
    for (const n of solids) {
      const P = n.mesh.geometry.getAttribute('position').array, T = n.data.triangles, M = n.mesh.matrixWorld;
      for (let i = 0; i + 2 < T.length; i += 3) {
        a.fromArray(P, T[i] * 3).applyMatrix4(M); b.fromArray(P, T[i + 1] * 3).applyMatrix4(M); c.fromArray(P, T[i + 2] * 3).applyMatrix4(M);
        nn.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)); const L = nn.length(); if (L < 1e-12) continue;
        if (nn.z / L > lim) continue;
        if (Math.max(a.z, b.z, c.z) < bed + 0.05) continue;   // liegt auf dem Druckbett
        area += L / 2; cx += ((a.x + b.x + c.x) / 3) * (L / 2); cy += ((a.y + b.y + c.y) / 3) * (L / 2); cz += ((a.z + b.z + c.z) / 3) * (L / 2);
        const o = nn.multiplyScalar(-0.02 / L);   // ein Hauch nach unten, damit es nicht flimmert
        out.push(a.x + o.x, a.y + o.y, a.z + o.z, b.x + o.x, b.y + o.y, b.z + o.z, c.x + o.x, c.y + o.y, c.z + o.z);
      }
    }
    return { pos: out, area, bed: isFinite(bed) ? bed : 0, c: area > 0 ? [cx / area, cy / area, cz / area] : null };
  }
  function drawOverhang() {
    const o = st.ov; if (!o) return;
    if (o.mesh) { Viewer.groups.overlay.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); o.mesh = null; }
    const d = overhangData(o.angle);
    o.area = d.area;
    if (d.pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      const m = new THREE.MeshBasicMaterial({ color: 0xe0483b, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      o.mesh = new THREE.Mesh(g, m); o.mesh.renderOrder = 18; Viewer.groups.overlay.add(o.mesh);
    }
    const t = o.bar && o.bar.querySelector('#ov-area');
    if (t) t.textContent = d.area > 0.05 ? `${Units.fmtAreaU(d.area, d.area < 100 ? 1 : 0)} brauchen Stützen` : 'Keine Überhänge – druckt ohne Stützen';
    Viewer.requestRender();
  }
  function overhang(on = !st.ov) {
    if (!on) { if (st.ov) { if (st.ov.mesh) { Viewer.groups.overlay.remove(st.ov.mesh); st.ov.mesh.geometry.dispose(); st.ov.mesh.material.dispose(); } if (st.ov.bar) st.ov.bar.remove(); st.ov = null; Viewer.requestRender(); } sync(); return; }
    if (st.ov) return;
    const o = { angle: 45, mesh: null, area: 0 };
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Überhänge' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Überhänge'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Überhänge ausblenden', 'data-tip': 'Ausblenden' }); close.innerHTML = icon('close'); close.onclick = () => overhang(false);
    head.append(close);
    const sel = h('select', { id: 'ov-angle', class: 'vb-sel', 'aria-label': 'Grenzwinkel' });
    for (const a of [35, 40, 45, 50, 55, 60]) sel.append(h('option', { value: a, ...(a === 45 ? { selected: true } : {}) }, a + '°'));
    sel.onchange = () => { o.angle = +sel.value; drawOverhang(); };
    bar.append(head, h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Ab'), sel, h('span', { class: 'vb-hint' }, 'Neigung gegen die Senkrechte')), h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'ov-area' }, '')), h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint' }, 'Rot = hängt beim Drucken in der Luft. Druckbett ist die Unterseite.')));
    const ob = h('button', { type: 'button', class: 'btn small', id: 'ov-orient', 'data-help': 'orientPrint' });
    ob.innerHTML = icon('rotate') + 'Für den Druck ausrichten';
    ob.onclick = () => Print.orientForPrint(null, { angle: o.angle });
    bar.append(h('div', { class: 'vb-row' }, ob));
    bars().append(bar); o.bar = bar;
    st.ov = o; drawOverhang(); sync();
  }

  // ---------- Wandstärke (3D-Druck, PF-07, DR-04): Stellen dünner als die Grenze werden rot ----------
  function drawThin() {
    const o = st.thin; if (!o) return;
    if (o.mesh) { Viewer.groups.overlay.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); o.mesh = null; }
    const d = Viewer.thinWalls(o.limit);
    o.area = d.area; o.minT = d.minT;
    if (d.pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      const m = new THREE.MeshBasicMaterial({ color: 0xe0483b, transparent: true, opacity: 0.78, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      o.mesh = new THREE.Mesh(g, m); o.mesh.renderOrder = 18; Viewer.groups.overlay.add(o.mesh);
    }
    const t = o.bar && o.bar.querySelector('#thin-area');
    if (t) t.textContent = d.area > 0.05 ? `${Units.fmtAreaU(d.area, d.area < 100 ? 1 : 0)} dünner als ${Units.fmtLenU(o.limit, 1)} – dünnste Stelle ${Units.fmtLenU(d.minT, 2)}` : `Überall mindestens ${Units.fmtLenU(o.limit, 1)}`;
    const nwEl = o.bar && o.bar.querySelector('#thin-nozzle-warn');
    if (nwEl && typeof Print !== 'undefined' && Print.nozzleWallCheck) {
      const nw = Print.nozzleWallCheck();
      nwEl.className = nw.warn ? 'hint-box warn' : 'vb-hint';
      nwEl.textContent = nw.summary;
      nwEl.hidden = !nw.summary;
    }
    Viewer.requestRender();
  }
  function thin(on = !st.thin, opts = {}) {
    if (!on) { if (st.thin) { if (st.thin.mesh) { Viewer.groups.overlay.remove(st.thin.mesh); st.thin.mesh.geometry.dispose(); st.thin.mesh.material.dispose(); } if (st.thin.bar) st.thin.bar.remove(); st.thin = null; Viewer.requestRender(); } sync(); return; }
    const noz = typeof Print !== 'undefined' && Print.nozzle ? Print.nozzle() : 0.4;
    const minWall = round(2 * noz, 2);
    const lim = opts && opts.limit > 0 ? round(opts.limit, 2) : 1.2;
    if (st.thin) {
      if (opts && opts.limit > 0) {
        st.thin.limit = lim;
        const sel = st.thin.bar && st.thin.bar.querySelector('#thin-limit');
        if (sel) {
          if (![...sel.options].some((op) => Math.abs(+op.value - lim) < 1e-4)) {
            sel.append(h('option', { value: lim }, Units.fmtLenFixedU(lim, 2)));
          }
          sel.value = String([...sel.options].find((op) => Math.abs(+op.value - lim) < 1e-4)?.value || lim);
        }
        drawThin();
      }
      return;
    }
    const o = { limit: lim, mesh: null, area: 0 };
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Wandstärke' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Wandstärke'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Wandstärke ausblenden', 'data-tip': 'Ausblenden' }); close.innerHTML = icon('close'); close.onclick = () => thin(false);
    head.append(close);
    const sel = h('select', { id: 'thin-limit', class: 'vb-sel', 'aria-label': 'Mindest-Wandstärke' });
    const vals = [0.4, 0.8, 1.2, 1.6, 2, 3, 5];
    if (!vals.some((a) => Math.abs(a - minWall) < 1e-4)) vals.push(minWall);
    if (!vals.some((a) => Math.abs(a - lim) < 1e-4)) vals.push(lim);
    vals.sort((a, b) => a - b);
    for (const a of vals) {
      const isNoz = Math.abs(a - minWall) < 1e-4;
      const lbl = Units.fmtLenFixedU(a, a % 0.1 > 1e-3 ? 2 : 1) + (isNoz ? ' (2 × Düse)' : '');
      sel.append(h('option', { value: a, ...(Math.abs(a - lim) < 1e-4 ? { selected: true } : {}) }, lbl));
    }
    sel.onchange = () => { o.limit = +sel.value; drawThin(); };
    const nozBtn = h('button', { type: 'button', class: 'btn small', id: 'thin-nozzle-btn', 'data-help': 'nozzleWall' }, 'Düse 2×');
    nozBtn.onclick = () => {
      const curMin = round(2 * (typeof Print !== 'undefined' && Print.nozzle ? Print.nozzle() : 0.4), 2);
      o.limit = curMin;
      if (![...sel.options].some((op) => Math.abs(+op.value - curMin) < 1e-4)) sel.append(h('option', { value: curMin }, Units.fmtLenFixedU(curMin, 2)));
      sel.value = String([...sel.options].find((op) => Math.abs(+op.value - curMin) < 1e-4)?.value || curMin);
      drawThin();
    };
    bar.append(head,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Rot unter'), sel, nozBtn),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint' }, `Düse ${fmt(noz, 2)} mm: mindestens ${Units.fmtLenU(minWall, 2)} (2 × Düse)`)),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'thin-area' }, '')),
      h('div', { class: 'vb-row' }, h('div', { id: 'thin-nozzle-warn', class: 'vb-hint', 'data-help': 'nozzleWall' }, '')));
    bars().append(bar); o.bar = bar;
    st.thin = o; drawThin(); sync();
  }

  // ---------- Vorführ-Modus (AN-19): nur das Modell, Vollbild, auf Wunsch langsam drehend ----------
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function present(on = !st.present) {
    if (!on) {
      if (!st.present) return;
      cancelAnimationFrame(st.present.raf); if (st.present.bar) st.present.bar.remove();
      Viewer.canvas.removeEventListener('pointerdown', st.present.pd); removeEventListener('pointerup', st.present.pu);
      if (st.present.onFs) {
        document.removeEventListener('fullscreenchange', st.present.onFs);
        document.removeEventListener('webkitfullscreenchange', st.present.onFs);
      }
      document.body.classList.remove('presenting');
      try {
        if (fsEl()) {
          if (document.exitFullscreen) Promise.resolve(document.exitFullscreen()).catch(() => {});
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      } catch (_) {}
      st.present = null; sync(); setTimeout(() => Viewer.requestRender(), 50); return;
    }
    if (st.present) return;
    if (st.quad) quad(false);
    App.clearSelection(); Handles.clear();
    const o = { spin: true, raf: 0, last: performance.now(), wasFs: false };
    o.onFs = () => {
      const fs = !!fsEl();
      if (fs) o.wasFs = true;
      else if (o.wasFs && st.present === o) present(false);
    };
    document.addEventListener('fullscreenchange', o.onFs);
    document.addEventListener('webkitfullscreenchange', o.onFs);
    document.body.classList.add('presenting');
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) Promise.resolve(el.requestFullscreen()).catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (_) {}
    const bar = h('div', { class: 'present-bar', id: 'present-bar' });
    const sp = h('button', { type: 'button', class: 'btn small', id: 'present-spin' }, 'Drehen anhalten');
    sp.onclick = () => { o.spin = !o.spin; sp.textContent = o.spin ? 'Drehen anhalten' : 'Langsam drehen'; o.last = performance.now(); };
    const ex = h('button', { type: 'button', class: 'btn small', id: 'present-exit' }, 'Beenden (Esc)'); ex.onclick = () => present(false);
    bar.append(sp, ex); document.body.append(bar); o.bar = bar;
    // langsam um die senkrechte Achse durch den Blickpunkt: eine Runde in 40 s
    const tick = (t) => {
      if (!st.present) return;
      const dt = Math.min(0.1, (t - o.last) / 1000); o.last = t;
      if (o.spin && !o.down) {
        const c = Viewer.camera, tg = Viewer.controls.target, a = (dt * 2 * Math.PI) / 40;
        const dx = c.position.x - tg.x, dy = c.position.y - tg.y, cs = Math.cos(a), sn = Math.sin(a);
        c.position.x = tg.x + dx * cs - dy * sn; c.position.y = tg.y + dx * sn + dy * cs; c.lookAt(tg); Viewer.controls.update(); Viewer.requestRender();
      }
      o.raf = requestAnimationFrame(tick);
    };
    o.pd = () => { o.down = true; }; o.pu = () => { o.down = false; o.last = performance.now(); };
    Viewer.canvas.addEventListener('pointerdown', o.pd); addEventListener('pointerup', o.pu);
    st.present = o; o.raf = requestAnimationFrame(tick);
    setTimeout(() => { Viewer.fit(null, true); }, 120);
    UI.toast('Vorführ-Modus – Esc beendet ihn.', { icon: 'eye', ms: 2500 });
  }

  // ---------- Fahrtwind (Stirnfläche) ----------
  // Blick aus der Richtung, aus der der Wind kommt: Die Drohne fliegt nach vorne (−Y) und ist um „Neigung“ mit der Nase nach unten gekippt.
  // Die Fläche, die sie dem Wind zeigt, misst der Viewer per Schattenriss. Propeller zählen auf Wunsch mit.
  const isProp = (id) => {
    const it = App.doc.items.find((x) => x.id === id); if (!it) return false;
    if (it.kind === 'part' && it.p && it.p.lib === 'buyProp') return true;
    if (it.kind === 'group') { let any = false, all = true; Model.walk(it.children || [], (k) => { if (k.kind === 'group') return; any = true; if (!(k.kind === 'part' && k.p && k.p.lib === 'buyProp')) { all = false; return false; } }); if (any && all) return true; }
    return /^Propeller/.test(it.name || '') && it.kind === 'group';
  };
  const windDir = (angle) => { const a = (angle * Math.PI) / 180; return [0, Math.cos(a), -Math.sin(a)]; };
  const windIds = (withProps) => [...Viewer.nodes.entries()].filter(([id, n]) => n.obj.visible && n.role !== 'hole' && n.mesh && (withProps || !isProp(id))).map(([id]) => id);
  function windArea(angle = 0, withProps = false) { return Viewer.silhouette(windIds(withProps), windDir(angle)).area; }
  // Luftwiderstand: F = ½ · ρ · v² · cw · A (Luft auf Meereshöhe, 15 °C)
  const RHO = 1.225;
  const CWS = [[1.1, 'Offener Rahmen · cw 1,1'], [0.8, 'Mit Haube · cw 0,8'], [0.5, 'Stromlinien-Rumpf · cw 0,5'], [0.35, 'Rumpf + Armverkleidung · cw 0,35']];
  function cwGuess(doc = App.doc) {
    let fair = false; Model.walk(doc.items, (it) => { if (it.kind === 'part' && it.p && (it.p.lib === 'armFairing' || it.p.lib === 'motorFairing')) fair = true; });
    const V = Model.vars(doc).v, body = typeof V.Rumpfdurchmesser === 'number' || doc.items.some((it) => /^Rumpf/.test(it.name || ''));
    return body && fair ? 0.35 : body ? 0.5 : 1.1;
  }
  const dragN = (areaMM2, cw, kmh) => 0.5 * RHO * (kmh / 3.6) ** 2 * cw * areaMM2 * 1e-6;
  // Höchstgeschwindigkeit: voller Schub, so weit geneigt, dass er die Drohne gerade noch trägt (T·cos θ = Gewicht);
  // der waagerechte Anteil T·sin θ = √(T² − G²) hält dem Luftwiderstand bei der Stirnfläche unter dieser Neigung die Waage.
  // Mit nach vorne geneigten Motoren (motorTilt) liegt der Rumpf um diesen Winkel flacher als der Schub.
  function topSpeed(thrustG, massG, cw, areaAt, motorTilt = 0) {
    if (!(thrustG > massG) || !(cw > 0)) return null;
    const th = Math.acos(massG / thrustG), deg = (th * 180) / Math.PI, body = Math.max(0, deg - motorTilt), A = areaAt(body);
    if (!(A > 0)) return null;
    const F = Math.sqrt(thrustG * thrustG - massG * massG) * 9.80665e-3;
    return { kmh: Math.sqrt((2 * F) / (RHO * cw * A * 1e-6)) * 3.6, deg, body, F, A };
  }
  async function windTop(o) {
    const el = o.bar.querySelector('#wind-top'); if (!el) return;
    const g = DroneCheck.geometry(App.doc), t = DroneCheck.thrustOf(App.doc);
    if (!g || !g.n || !t) { el.innerHTML = 'Höchstgeschwindigkeit: im <b>Drohnen-Check</b> den Schub pro Motor eintragen.'; return; }
    const m = await Mass.measure(); if (st.wind !== o) return;
    if (!m || !m.mass) { el.textContent = 'Höchstgeschwindigkeit: Gewicht unbekannt.'; return; }
    const r = topSpeed(g.n * t, m.mass, o.cw, (deg) => Viewer.silhouette(windIds(o.props), windDir(deg)).area, g.tilt || 0);
    o.top = r;
    if (!r) { el.textContent = 'Zu wenig Schub zum Schweben – keine Höchstgeschwindigkeit.'; return; }
    el.innerHTML = `Höchstens etwa <b>${fmtFixed(r.kmh, 0)} km/h</b> bei ${fmtFixed(r.deg, 0)}° Neigung` + (g.tilt ? ` (Rumpf ${fmtFixed(r.body, 0)}°, Motoren ${fmtFixed(g.tilt, 0)}° geneigt)` : '') + ` – geschätzt aus Schub (${g.n} × ${fmtFixed(t, 0)} g), Gewicht (${Mass.gText(m.mass)}) und Stirnfläche. Propeller verlieren bei hohem Tempo Schub, echt also eher weniger.`;
  }
  function drawWind(moveCam) {
    const o = st.wind; if (!o) return;
    const r = Viewer.silhouette(windIds(o.props), windDir(o.angle)); o.area = r.area;
    const t = o.bar.querySelector('#wind-area');
    if (t) t.innerHTML = r.area > 0 ? `Stirnfläche <b>${fmtFixed(r.area / 100, r.area < 100 ? 2 : 1)} cm²</b>` + (o.props ? ' mit Propellern' : ' ohne Propeller') : 'Nichts zu sehen.';
    const dEl = o.bar.querySelector('#wind-drag');
    if (dEl) {
      const D = dragN(r.area, o.cw, o.v); o.drag = D;
      dEl.innerHTML = r.area > 0 && o.v > 0 ? `Bei ${fmtFixed(o.v, 0)} km/h: Luftwiderstand etwa <b>${fmtFixed(D, D < 10 ? 1 : 0)} N</b> – so viel wie ${fmtFixed((D / 9.80665) * 1000, 0)} g Schub; dafür braucht es etwa ${fmtFixed((D * o.v) / 3.6, 0)} W.` : '';
    }
    if (moveCam && r.c) Viewer.lookAtPlane(r.c, windDir(o.angle).map((v) => -v), [1, 0, 0], r.R * 1.15);
    Viewer.requestRender();
  }
  function wind(on = !st.wind) {
    if (!on) { if (st.wind) { const o = st.wind; o.bar.remove(); st.wind = null; Viewer.setOrtho(o.ortho); Viewer.restoreCamera(o.cam); } sync(); return; }
    if (st.wind) return;
    const o = { angle: 0, props: false, area: 0, cw: cwGuess(), v: 100, cam: Viewer.saveCamera(), ortho: Viewer.ortho };
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Fahrtwind' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Fahrtwind'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Fahrtwind schließen', 'data-tip': 'Schließen' }); close.innerHTML = icon('close'); close.onclick = () => wind(false);
    head.append(close);
    const rng = h('input', { type: 'range', id: 'wind-angle', min: 0, max: 60, step: 5, value: 0, 'aria-label': 'Neigung nach vorne' });
    const val = h('span', { class: 'vb-l', id: 'wind-angle-v' }, '0°');
    rng.oninput = () => { o.angle = +rng.value; val.textContent = rng.value + '°'; drawWind(true); };
    const cb = h('input', { type: 'checkbox', id: 'wind-props' }); cb.onchange = () => { o.props = cb.checked; drawWind(false); windTop(o); };
    const cwSel = h('select', { id: 'wind-cw', class: 'vb-sel', style: { flex: '1', minWidth: '0' }, 'aria-label': 'Form der Drohne (cw-Wert)' });
    for (const [v, l] of CWS) { const op = h('option', { value: v }, l); if (v === o.cw) op.selected = true; cwSel.append(op); }
    cwSel.onchange = () => { o.cw = +cwSel.value; drawWind(false); windTop(o); };
    const vIn = h('input', { type: 'number', id: 'wind-v', class: 'vb-num', min: 0, max: 500, step: 10, value: o.v, 'aria-label': 'Tempo in km/h' });
    vIn.onchange = () => { const v = parseFloat(vIn.value); if (v >= 0) { o.v = v; drawWind(false); } };
    bar.append(head,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Neigung'), rng, val),
      h('div', { class: 'vb-row' }, h('label', { class: 'vb-hint' }, cb, ' Propeller mitzählen')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'wind-area' }, '')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Form'), cwSel),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Tempo'), vIn, h('span', { class: 'vb-u' }, 'km/h')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'wind-drag' }, '')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'wind-top' }, '')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint' }, 'So sieht der Wind deine Drohne, wenn sie mit dieser Neigung nach vorne fliegt. Kleinere Fläche = weniger Luftwiderstand.')));
    bars().append(bar); o.bar = bar;
    st.wind = o; Viewer.setOrtho(true); drawWind(true); sync(); windTop(o);
  }

  // ---------- Vierfach-Ansicht (AN-18): Vorn, Oben, Rechts, Schräg ----------
  const QUAD_KEYS = ['front', 'top', 'right', 'iso'];
  function quad(on = !st.quad) {
    if (!on) {
      if (!st.quad) return;
      const q = st.quad;
      st.quad = null;
      if (q.off) q.off();
      if (q.el) q.el.remove();
      document.body.classList.remove('quad-view-on');
      Viewer.setQuad(false);
      sync();
      UI.toast(T('quad.toastOff'), { icon: 'info', ms: 1800, noNotice: true });
      return;
    }
    if (st.quad) return;
    if (App.mode !== 'model' || (typeof Sketch !== 'undefined' && Sketch.active)) return;
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) return;
    if (st.present) present(false);
    App.clearSelection(); Handles.clear();
    const wrap = h('div', { class: 'quad-view', id: 'quad-view', role: 'region', 'aria-label': T('quad.aria') });
    const hostMap = {};
    const paneEls = {};
    for (const key of QUAD_KEYS) {
      const pane = h('div', { class: 'quad-pane', 'data-quad': key });
      const hit = h('div', { class: 'quad-hit', 'data-quad-hit': key });
      hit.addEventListener('contextmenu', (e) => e.preventDefault());
      let clickPt = null;
      hit.addEventListener('pointerdown', (e) => {
        if (e.button === 0) clickPt = { x: e.clientX, y: e.clientY };
        Viewer.setActiveQuadPane(key);
      });
      hit.addEventListener('pointerup', (e) => {
        if (clickPt && e.button === 0 && Math.hypot(e.clientX - clickPt.x, e.clientY - clickPt.y) <= 4) {
          const res = Viewer.pickInPane(key, e.clientX, e.clientY);
          if (res) App.select([res.id]);
          else App.clearSelection();
        }
        clickPt = null;
      });
      hit.addEventListener('dblclick', () => Viewer.resetQuadPane(key));
      const lbl = h('span', { class: 'quad-label' }, T('quad.' + key));
      const proj = h('button', { type: 'button', class: 'quad-proj', 'aria-label': T('quad.toggleProj'), 'data-tip': T('quad.toggleProj'), 'aria-pressed': key === 'iso' ? 'false' : 'true' }, key === 'iso' ? T('quad.persp') : T('quad.ortho'));
      proj.onclick = (e) => {
        e.stopPropagation();
        const cur = Viewer.quadPanes.find((x) => x.key === key);
        Viewer.setQuadPaneOrtho(key, !(cur && cur.ortho));
      };
      const rst = h('button', { type: 'button', class: 'quad-reset', 'aria-label': T('quad.resetPane'), 'data-tip': T('quad.resetPane') });
      rst.innerHTML = icon('rotate');
      rst.onclick = (e) => { e.stopPropagation(); Viewer.resetQuadPane(key); };
      const head = h('div', { class: 'quad-head' }, lbl, proj, rst);
      pane.append(hit, head);
      wrap.append(pane);
      hostMap[key] = hit;
      paneEls[key] = { pane, lbl, proj, rst };
    }
    const closeBtn = h('button', { type: 'button', class: 'quad-close-btn', id: 'quad-close', 'aria-label': T('quad.exitAria'), 'data-help': 'quadView' });
    closeBtn.innerHTML = icon('close') + `<span>${esc(T('quad.exit'))}</span>`;
    closeBtn.onclick = () => quad(false);
    wrap.append(closeBtn);
    $('#overlay').prepend(wrap);
    document.body.classList.add('quad-view-on');
    Viewer.setQuad(true, hostMap);
    const syncQuadUI = () => {
      if (!st.quad) return;
      const panes = Viewer.quadPanes;
      for (const info of panes) {
        const ui = paneEls[info.key]; if (!ui) continue;
        ui.pane.classList.toggle('active', !!info.active);
        ui.proj.textContent = info.ortho ? T('quad.ortho') : T('quad.persp');
        ui.proj.setAttribute('aria-pressed', info.ortho ? 'true' : 'false');
      }
    };
    const updateQuadLabels = () => {
      if (!st.quad) return;
      wrap.setAttribute('aria-label', T('quad.aria'));
      closeBtn.setAttribute('aria-label', T('quad.exitAria'));
      const sp = closeBtn.querySelector('span');
      if (sp) sp.textContent = T('quad.exit');
      for (const key of QUAD_KEYS) {
        const ui = paneEls[key]; if (!ui) continue;
        ui.lbl.textContent = T('quad.' + key);
        ui.proj.setAttribute('aria-label', T('quad.toggleProj'));
        ui.proj.setAttribute('data-tip', T('quad.toggleProj'));
        ui.rst.setAttribute('aria-label', T('quad.resetPane'));
        ui.rst.setAttribute('data-tip', T('quad.resetPane'));
      }
      syncQuadUI();
    };
    const offV = Viewer.on('viewmode', syncQuadUI);
    const offI = typeof I18n !== 'undefined' && I18n.on ? I18n.on('change', updateQuadLabels) : null;
    st.quad = { el: wrap, panes: paneEls, off: () => { offV && offV(); offI && offI(); } };
    syncQuadUI();
    sync();
    Viewer.renderNow();
    UI.toast(T('quad.toastOn'), { icon: 'quadView', ms: 2600 });
  }

  // ---------- Menü und Zustand ----------
  function menu(anchor) {
    UI.menu(anchor, [
      { label: (st.cut ? '✓ ' : '') + T('menu.view.section'), icon: 'section', kbd: 'C', help: 'section', run: () => section() },
      { label: (st.xray ? '✓ ' : '') + T('menu.view.xray'), icon: 'xray', kbd: 'X', help: 'xray', run: () => xray() },
      { label: (st.exGoal > 0 ? '✓ ' : '') + T('menu.view.explode'), icon: 'explode', kbd: 'U', help: 'explode', run: () => explode() },
      { label: (st.focus ? '✓ ' : '') + T('menu.view.focus'), icon: 'focusView', help: 'focusView', run: () => focus() },
      { label: (st.quad ? '✓ ' : '') + T('menu.view.quad'), icon: 'quadView', help: 'quadView', id: 'view-quad', hidden: ViewPrefs.simple, run: () => quad() },
      { label: (st.ov ? '✓ ' : '') + T('menu.view.overhang'), icon: 'overhang', help: 'overhang', run: () => overhang() },
      { label: (st.thin ? '✓ ' : '') + T('menu.view.thin'), icon: 'ruler', help: 'thinWalls', id: 'view-thin', run: () => thin() },
      { label: (typeof Measure !== 'undefined' && Measure.draftActive ? '✓ ' : '') + T('menu.view.draft'), icon: 'chamfer', help: 'draftAnalysis', id: 'view-draft', run: () => Measure.draft() },
      { label: T('menu.view.present'), icon: 'play', kbd: 'P', help: 'present', id: 'view-present', run: () => present(true) },
      { label: T('menu.view.turntable'), icon: 'play', help: 'turntable', id: 'view-turntable', run: () => Print.turntableDialog() },
      { label: (typeof Motion !== 'undefined' && Motion.active ? '✓ ' : '') + T('motion.menuLabel'), icon: 'play', help: 'motionStudy', id: 'view-motion', hidden: ViewPrefs.simple, run: () => Motion.toggle() },
      '-', ...lookItems(),
    ]);
  }
  // ---------- Aussehen: Studio-Look, einfach, Prüfansicht; Licht-Stimmung; Schatten ----------
  const LOOKKEYS = ['studio', 'plain', 'clay', 'chrome'];
  const MOODKEYS = ['studio', 'hell', 'werkstatt'];
  function setLook(k) {
    ViewPrefs.set({ look: k });
    const tip = { studio: 'Studio-Look: Teile zeigen ihren Werkstoff – Metall glänzt, Kohlefaser ist dunkel.', plain: 'Einfache Darstellung: matt und am schnellsten.', clay: 'Prüfansicht Ton: Jede Delle und jeder Knick fällt auf.', chrome: 'Prüfansicht Chrom: Laufen die Streifen ohne Knick über eine Kante, gehen die Flächen glatt ineinander über.' }[k];
    UI.toast(tip, { icon: 'info', ms: 3200 });
  }
  const DISPKEYS = ['edges', 'shaded', 'wire', 'hidden', 'illustration'];
  // gespeicherte Ansichten (im Projekt): Blickwinkel, Ausschnitt und Projektion
  async function saveView() {
    const name = await UI.prompt('Ansicht speichern', 'Name der Ansicht', `Ansicht ${(App.doc.views || []).length + 1}`, 'Speichern');
    if (!name || !name.trim()) return null;
    const c = Viewer.saveCamera(), v = { id: uid('v'), name: name.trim(), p: c.p.toArray(), t: c.t.toArray(), up: c.up.toArray(), ortho: !!ViewPrefs.get().ortho };
    App.change(`Ansicht „${v.name}“ gespeichert`, (doc) => { (doc.views = doc.views || []).push(v); });
    return v;
  }
  function goView(id) {
    const v = (App.doc.views || []).find((x) => x.id === id); if (!v) return false;
    if (!!ViewPrefs.get().ortho !== !!v.ortho) ViewPrefs.set({ ortho: !!v.ortho });
    Viewer.restoreCamera({ p: new THREE.Vector3(...v.p), t: new THREE.Vector3(...v.t), up: new THREE.Vector3(...v.up) });
    return true;
  }
  function removeView(id) { App.change('Ansicht gelöscht', (doc) => { doc.views = (doc.views || []).filter((x) => x.id !== id); }); }
  function lookItems() {
    const pv = ViewPrefs.get(), out = [];
    for (const k of DISPKEYS) {
      if (k === 'illustration' && ViewPrefs.simple) continue;
      out.push({ label: (pv.display === k || (!pv.display && k === 'edges') ? '✓ ' : '') + T('menu.view.disp.' + k), icon: k === 'wire' ? 'cube' : k === 'illustration' ? 'illustration' : 'eye', help: k === 'illustration' ? 'illustration' : 'display', id: 'disp-' + k, run: () => ViewPrefs.set({ display: k }) });
    }
    out.push('-');
    for (const k of LOOKKEYS) out.push({ label: (pv.look === k ? '✓ ' : '') + T('menu.view.look.' + k), icon: k === 'studio' ? 'spark' : 'eye', help: 'look', id: 'look-' + k, run: () => setLook(k) });
    if (pv.look === 'studio') {
      for (const k of MOODKEYS) out.push({ label: (!pv.envImageName && pv.mood === k ? '✓ ' : '') + T('menu.view.lightPrefix', { name: T('menu.view.mood.' + k) }), icon: 'sun', help: 'look', id: 'mood-' + k, run: () => ViewPrefs.set({ mood: k, envImageName: '', envImageData: '' }) });
      out.push({ label: (pv.shadows !== false ? '✓ ' : '') + T('menu.view.shadows'), icon: 'shadow', help: 'look', id: 'look-shadows', run: () => ViewPrefs.set({ shadows: pv.shadows === false }) });
    }
    out.push({ label: T('menu.view.floorLights'), icon: 'sun', help: 'studioFloorLight', id: 'look-studio-panel', run: () => ViewPrefs.openLookPanel() });
    out.push('-', { label: T('menu.view.viewBack'), icon: 'undo', kbd: 'Umschalt Z', help: 'viewBack', id: 'view-back', disabled: !Viewer.viewHistory, run: () => Viewer.viewBack() });
    out.push({ label: T('menu.view.saveView'), icon: 'plus', help: 'savedViews', id: 'view-save', run: () => saveView() });
    for (const v of App.doc.views || []) out.push({ label: T('menu.view.savedViewPrefix', { name: v.name }), icon: 'viewPersp', help: 'savedViews', id: 'view-go-' + v.id, run: () => goView(v.id) });
    return out;
  }
  function sync() {
    const b = $('#t-views'); if (b) b.classList.toggle('active', !!(st.cut || st.xray || st.exGoal > 0 || st.focus || st.ov || st.thin || st.wind || st.quad || (typeof Measure !== 'undefined' && Measure.draftActive)));
    const x = document.querySelector('.view-btns [data-view="xray"]'); if (x) x.classList.toggle('on', st.xray);
    const c = document.querySelector('.view-btns [data-view="cut"]'); if (c) c.classList.toggle('on', !!st.cut);
  }
  function onKey(e) {
    if (App.mode !== 'model' || Sketch.active || e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key.toLowerCase();
    if (k === 'c') { section(); return true; }
    if (k === 'x') { xray(); return true; }
    if (k === 'u') { explode(); return true; }
    return false;
  }
  function init() {
    App.on('mode', () => {
      if (App.mode !== 'model') reset();
      else if (typeof Sketch !== 'undefined' && Sketch.active && st.quad) quad(false);
    });
    // Während die Gruppen zerlegt gezeigt werden: nach jeder Änderung die Einzelteile neu aufbauen
    App.on('doc', () => { if (!st.exGroups) return; const { extra, hide } = splitGroups(); App.extra = extra; App.hideIds = hide; });
    App.on('results', () => {
      if (st.ex > 1e-4) setEx(st.ex);
      if (st.ov) drawOverhang();
      if (st.thin) drawThin();
      if (st.wind) drawWind(false);
      if (st.ex > 1e-4) setEx(st.ex);
      if (st.cut) {
        drawCutHelper();
        drawCutCaps();
        if (st.cut.bar) {
          const b = modelBox(), span = Math.ceil(b.getSize(new THREE.Vector3()).length());
          st.cut.bar.querySelectorAll('[data-cut-range]').forEach((r) => {
            const k = r.dataset.cutRange;
            if (k === 'FACE') { r.min = -span; r.max = span; }
            else { const ax = AX[k]; r.min = Math.floor(b.min.getComponent(ax) - 1); r.max = Math.ceil(b.max.getComponent(ax) + 1); }
          });
        }
      }
    });
  }
  function reset() { section(false); if (st.xray) xray(false); if (st.exWaitOff) { st.exWaitOff(); st.exWaitOff = null; } stopExAnim(); if (st.exGoal > 0 || st.ex > 0) { st.ex = st.exGoal = 0; Viewer.setOffsets(null); if (st.exBar) { st.exBar.remove(); st.exBar = null; } } focus(false); quad(false); overhang(false); thin(false); wind(false); present(false); if (typeof Measure !== 'undefined' && Measure.draftActive) Measure.draft(false); if (typeof Measure !== 'undefined' && Measure.silhouetteActive) Measure.silhouette(false); if (typeof InnerRadius !== 'undefined' && InnerRadius.active) InnerRadius.close(); if (typeof SymmetryCheck !== 'undefined' && SymmetryCheck.active) SymmetryCheck.close(); if (typeof Versions !== 'undefined' && Versions.comparing) Versions.compareOff(); if (st.exGroups) setGroups(false); }
  return { saveView, goView, removeView,     init, section, xray, explode, collapse, focus, quad, overhang, menu, onKey, reset, sync, bars,
    present, get presenting() { return !!st.present; }, thin, get thinInfo() { return st.thin ? { area: st.thin.area, minT: st.thin.minT } : null; },
    get quadActive() { return !!st.quad; }, get quadPanes() { return Viewer.quadPanes; },
    get overhangArea() { return st.ov ? st.ov.area : null; },
    get overhangAngle() { return st.ov ? st.ov.angle : 45; },
    wind, windArea, get windInfo() { return st.wind ? { angle: st.wind.angle, props: st.wind.props, area: st.wind.area, cw: st.wind.cw, v: st.wind.v, drag: st.wind.drag, top: st.wind.top || null } : null; }, cwGuess, topSpeed, dragN,
    overhangOf: (id, angle = 45) => { const d = overhangData(angle, [id]); return { area: d.area, c: d.c }; },
    get cut() {
      if (!st.cut) return null;
      const c = st.cut, entries = activeCutEntries();
      const curEntry = c.mode === 'face' ? c.face : (c.planes[c.active] && c.planes[c.active].on ? c.planes[c.active] : (entries[0] && entries[0].entry));
      const curKey = c.mode === 'face' ? 'FACE' : (c.planes[c.active] && c.planes[c.active].on ? c.active : (entries[0] && entries[0].key) || 'XZ');
      return {
        plane: curKey, off: curEntry ? curEntry.off : 0, flip: curEntry ? curEntry.flip : false,
        cap: c.cap, capArea: c.capArea, capCount: c.capCount,
        planes: entries.map(({ key, entry }) => ({ plane: key, axis: key === 'FACE' ? 'FACE' : AXNAME[key], off: entry.off, flip: entry.flip })),
      };
    },
    get isXray() { return st.xray; }, get exploded() { return st.ex > 1e-4 || st.exGoal > 0; }, get explodeAmount() { return st.ex; }, get explodeGroups() { return st.exGroups; }, setGroups,
    get focusIds() { return st.focus ? st.focus.ids.slice() : null; }, get focusDrawn() { return !!(st.focus && st.focus.drawn); },
  };
})();
