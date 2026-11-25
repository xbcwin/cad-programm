// ================= Durchdringungen, Kollision beim Ziehen (BG-17) & Abstands-Prüfung (BG-18) =================
const ClashCheck = (() => {
  let bar = null, last = null, focused = null, highlightGroup = null, busy = false, runSeq = 0;
  let clBar = null, clLast = null, clFocused = null, clHighlight = null, clLabelEl = null, clLabelPos = null;
  let clBusy = false, clSeq = 0, clMinGap = 1, clIncludeTouch = false;
  let contactFlashGroup = null, lastDragStop = null;

  function sync() {
    const btn = $('#t-clashes');
    if (btn) btn.classList.toggle('active', !!bar);
    const clBtn = $('#t-clearance');
    if (clBtn) clBtn.classList.toggle('active', !!clBar);
    const dsOn = stopOnContact();
    const dsBtn = $('#t-drag-stop');
    if (dsBtn) dsBtn.classList.toggle('active', dsOn);
    const dsChk = $('#drag-stop-contact');
    if (dsChk && dsChk.checked !== dsOn) dsChk.checked = dsOn;
    if (typeof GeomCheck !== 'undefined' && GeomCheck.sync) GeomCheck.sync();
  }

  function isSimpleMode() {
    return typeof ViewPrefs !== 'undefined' && !!ViewPrefs.simple;
  }

  // ---------- BG-17: Kollision beim Ziehen erkennen und anhalten ----------
  function stopOnContact() {
    if (isSimpleMode()) return false;
    return !!(typeof App !== 'undefined' && App.doc && App.doc.settings && App.doc.settings.stopOnContact);
  }

  function setStopOnContact(on) {
    if (isSimpleMode()) {
      UI.toast(T('clash.proOnly'), { icon: 'info' });
      return false;
    }
    const next = !!on;
    App.change(next ? T('clash.stopOnUndo') : T('clash.stopOffUndo'), (doc) => {
      doc.settings = doc.settings || {};
      doc.settings.stopOnContact = next;
    });
    if (!next) {
      clearContactFlash();
      lastDragStop = null;
    }
    sync();
    return next;
  }

  function toggleStopOnContact() {
    return setStopOnContact(!stopOnContact());
  }

  function extractLocalMesh(node) {
    const geo = node && node.mesh && node.mesh.geometry;
    const posAttr = geo && geo.attributes && geo.attributes.position;
    if (!posAttr || posAttr.count < 3) return null;
    const pos = posAttr.array;
    const idxAttr = geo.index;
    const dr = geo.drawRange || {};
    const drStart = dr.start || 0;
    let tris;
    if (idxAttr) {
      const arr = idxAttr.array;
      const drEnd = Number.isFinite(dr.count) ? Math.min(arr.length, drStart + dr.count) : arr.length;
      const nTris = Math.floor(Math.max(0, drEnd - drStart) / 3);
      if (nTris < 1) return null;
      tris = new Uint32Array(nTris * 3);
      for (let i = 0; i < nTris * 3; i++) tris[i] = arr[drStart + i];
    } else {
      const drEnd = Number.isFinite(dr.count) ? Math.min(posAttr.count, drStart + dr.count) : posAttr.count;
      const nTris = Math.floor(Math.max(0, drEnd - drStart) / 3);
      if (nTris < 1) return null;
      tris = new Uint32Array(nTris * 3);
      for (let i = 0; i < nTris * 3; i++) tris[i] = drStart + i;
    }
    return { verts: new Float32Array(pos), tris };
  }

  function buildWorldMesh(local, mat) {
    const e = mat.elements;
    const src = local.verts;
    const nVerts = Math.floor(src.length / 3);
    const verts = new Float32Array(nVerts * 3);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < nVerts; i++) {
      const k = i * 3;
      const x = src[k], y = src[k + 1], z = src[k + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      verts[k] = wx; verts[k + 1] = wy; verts[k + 2] = wz;
      if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
      if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
    }
    const flip = mat.determinant() < 0 ? -1 : 1;
    const tris = local.tris;
    const nTris = Math.floor(tris.length / 3);
    const norms = new Float32Array(nTris * 3);
    const triBox = new Float32Array(nTris * 6);
    for (let t = 0; t < nTris; t++) {
      const ti = t * 3;
      const i0 = tris[ti] * 3, i1 = tris[ti + 1] * 3, i2 = tris[ti + 2] * 3;
      const ax = verts[i0], ay = verts[i0 + 1], az = verts[i0 + 2];
      const bx = verts[i1], by = verts[i1 + 1], bz = verts[i1 + 2];
      const cx = verts[i2], cy = verts[i2 + 1], cz = verts[i2 + 2];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      let nx = (e1y * e2z - e1z * e2y) * flip;
      let ny = (e1z * e2x - e1x * e2z) * flip;
      let nz = (e1x * e2y - e1y * e2x) * flip;
      const nl = Math.hypot(nx, ny, nz);
      if (nl > 1e-12) { nx /= nl; ny /= nl; nz /= nl; } else { nx = 0; ny = 0; nz = 0; }
      norms[ti] = nx; norms[ti + 1] = ny; norms[ti + 2] = nz;
      const bi = t * 6;
      triBox[bi] = Math.min(ax, bx, cx);
      triBox[bi + 1] = Math.min(ay, by, cy);
      triBox[bi + 2] = Math.min(az, bz, cz);
      triBox[bi + 3] = Math.max(ax, bx, cx);
      triBox[bi + 4] = Math.max(ay, by, cy);
      triBox[bi + 5] = Math.max(az, bz, cz);
    }
    return { verts, tris, norms, triBox, nTris, bbox: [minX, minY, minZ, maxX, maxY, maxZ] };
  }

  const COL_EPS = 1e-4;
  const BOUND_EPS = 4e-4;
  const BOUND_EPS_SQ = BOUND_EPS * BOUND_EPS;
  const RAY_DIRS = [
    norm3([0.871234, 0.389123, 0.299456]),
    norm3([-0.412345, 0.823456, 0.389712]),
    norm3([0.231451, -0.543219, 0.807011]),
  ];
  function norm3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function pointTriDistSq(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;

    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      const qx = ax + abx * v - px, qy = ay + aby * v - py, qz = az + abz * v - pz;
      return qx * qx + qy * qy + qz * qz;
    }

    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      const qx = ax + acx * w - px, qy = ay + acy * w - py, qz = az + acz * w - pz;
      return qx * qx + qy * qy + qz * qz;
    }

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
      const qx = bx + (cx - bx) * w - px, qy = by + (cy - by) * w - py, qz = bz + (cz - bz) * w - pz;
      return qx * qx + qy * qy + qz * qz;
    }

    const denom = 1 / (va + vb + vc);
    const v = vb * denom, w = vc * denom;
    const qx = ax + abx * v + acx * w - px;
    const qy = ay + aby * v + acy * w - py;
    const qz = az + abz * v + acz * w - pz;
    return qx * qx + qy * qy + qz * qz;
  }

  function pointStrictlyInMesh(px, py, pz, mesh, ox = 0, oy = 0, oz = 0) {
    const qx = px - ox, qy = py - oy, qz = pz - oz;
    const b = mesh.bbox;
    if (qx <= b[0] + BOUND_EPS || qx >= b[3] - BOUND_EPS || qy <= b[1] + BOUND_EPS || qy >= b[4] - BOUND_EPS || qz <= b[2] + BOUND_EPS || qz >= b[5] - BOUND_EPS) {
      return false;
    }
    const { verts, tris, triBox, nTris } = mesh;
    for (let t = 0; t < nTris; t++) {
      const bi = t * 6;
      if (qx < triBox[bi] - BOUND_EPS || qx > triBox[bi + 3] + BOUND_EPS ||
          qy < triBox[bi + 1] - BOUND_EPS || qy > triBox[bi + 4] + BOUND_EPS ||
          qz < triBox[bi + 2] - BOUND_EPS || qz > triBox[bi + 5] + BOUND_EPS) continue;
      const ti = t * 3;
      const i0 = tris[ti] * 3, i1 = tris[ti + 1] * 3, i2 = tris[ti + 2] * 3;
      if (pointTriDistSq(qx, qy, qz, verts[i0], verts[i0 + 1], verts[i0 + 2], verts[i1], verts[i1 + 1], verts[i1 + 2], verts[i2], verts[i2 + 1], verts[i2 + 2]) < BOUND_EPS_SQ) {
        return false;
      }
    }
    for (let r = 0; r < RAY_DIRS.length; r++) {
      const dx = RAY_DIRS[r][0], dy = RAY_DIRS[r][1], dz = RAY_DIRS[r][2];
      let hits = 0, ambiguous = false;
      for (let t = 0; t < nTris; t++) {
        const bi = t * 6;
        if (dx > 0 && triBox[bi + 3] < qx) continue;
        if (dx < 0 && triBox[bi] > qx) continue;
        if (dy > 0 && triBox[bi + 4] < qy) continue;
        if (dy < 0 && triBox[bi + 1] > qy) continue;
        if (dz > 0 && triBox[bi + 5] < qz) continue;
        if (dz < 0 && triBox[bi + 2] > qz) continue;
        const ti = t * 3;
        const i0 = tris[ti] * 3, i1 = tris[ti + 1] * 3, i2 = tris[ti + 2] * 3;
        const ax = verts[i0], ay = verts[i0 + 1], az = verts[i0 + 2];
        const e1x = verts[i1] - ax, e1y = verts[i1 + 1] - ay, e1z = verts[i1 + 2] - az;
        const e2x = verts[i2] - ax, e2y = verts[i2 + 1] - ay, e2z = verts[i2 + 2] - az;
        const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-10) continue;
        const inv = 1 / det;
        const sx = qx - ax, sy = qy - ay, sz = qz - az;
        const u = (sx * hx + sy * hy + sz * hz) * inv;
        if (u < 0 || u > 1) continue;
        const qvx = sy * e1z - sz * e1y, qvy = sz * e1x - sx * e1z, qvz = sx * e1y - sy * e1x;
        const v = (dx * qvx + dy * qvy + dz * qvz) * inv;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2x * qvx + e2y * qvy + e2z * qvz) * inv;
        if (dist <= 0) continue;
        if (u < 1e-5 || v < 1e-5 || u + v > 1 - 1e-5) { ambiguous = true; break; }
        hits++;
      }
      if (!ambiguous) return (hits & 1) === 1;
    }
    return false;
  }

  function segTriStrict(p0x, p0y, p0z, p1x, p1y, p1z, ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) {
    const s0 = (p0x - ax) * nx + (p0y - ay) * ny + (p0z - az) * nz;
    const s1 = (p1x - ax) * nx + (p1y - ay) * ny + (p1z - az) * nz;
    if ((s0 >= -2e-4 && s1 >= -2e-4) || (s0 <= 2e-4 && s1 <= 2e-4)) return false;
    const dx = p1x - p0x, dy = p1y - p0y, dz = p1z - p0z;
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-10) return false;
    const inv = 1 / det;
    const sx = p0x - ax, sy = p0y - ay, sz = p0z - az;
    const u = (sx * hx + sy * hy + sz * hz) * inv;
    if (u <= 2e-4 || u >= 1 - 2e-4) return false;
    const qvx = sy * e1z - sz * e1y, qvy = sz * e1x - sx * e1z, qvz = sx * e1y - sy * e1x;
    const v = (dx * qvx + dy * qvy + dz * qvz) * inv;
    if (v <= 2e-4 || u + v >= 1 - 2e-4) return false;
    const t = (e2x * qvx + e2y * qvy + e2z * qvz) * inv;
    return t > 2e-4 && t < 1 - 2e-4;
  }

  function triTriStrict(A, ax, ay, az, ia, B, ib) {
    const { verts: vA, tris: tA, norms: nA } = A;
    const { verts: vB, tris: tB, norms: nB } = B;
    const tia = ia * 3, tib = ib * 3;
    const a0 = tA[tia] * 3, a1 = tA[tia + 1] * 3, a2 = tA[tia + 2] * 3;
    const b0 = tB[tib] * 3, b1 = tB[tib + 1] * 3, b2 = tB[tib + 2] * 3;

    const a0x = vA[a0] + ax, a0y = vA[a0 + 1] + ay, a0z = vA[a0 + 2] + az;
    const a1x = vA[a1] + ax, a1y = vA[a1 + 1] + ay, a1z = vA[a1 + 2] + az;
    const a2x = vA[a2] + ax, a2y = vA[a2 + 1] + ay, a2z = vA[a2 + 2] + az;

    const b0x = vB[b0], b0y = vB[b0 + 1], b0z = vB[b0 + 2];
    const b1x = vB[b1], b1y = vB[b1 + 1], b1z = vB[b1 + 2];
    const b2x = vB[b2], b2y = vB[b2 + 1], b2z = vB[b2 + 2];

    const nbx = nB[tib], nby = nB[tib + 1], nbz = nB[tib + 2];
    if (segTriStrict(a0x, a0y, a0z, a1x, a1y, a1z, b0x, b0y, b0z, b1x, b1y, b1z, b2x, b2y, b2z, nbx, nby, nbz)) return true;
    if (segTriStrict(a1x, a1y, a1z, a2x, a2y, a2z, b0x, b0y, b0z, b1x, b1y, b1z, b2x, b2y, b2z, nbx, nby, nbz)) return true;
    if (segTriStrict(a2x, a2y, a2z, a0x, a0y, a0z, b0x, b0y, b0z, b1x, b1y, b1z, b2x, b2y, b2z, nbx, nby, nbz)) return true;

    const nax = nA[tia], nay = nA[tia + 1], naz = nA[tia + 2];
    if (segTriStrict(b0x, b0y, b0z, b1x, b1y, b1z, a0x, a0y, a0z, a1x, a1y, a1z, a2x, a2y, a2z, nax, nay, naz)) return true;
    if (segTriStrict(b1x, b1y, b1z, b2x, b2y, b2z, a0x, a0y, a0z, a1x, a1y, a1z, a2x, a2y, a2z, nax, nay, naz)) return true;
    if (segTriStrict(b2x, b2y, b2z, b0x, b0y, b0z, a0x, a0y, a0z, a1x, a1y, a1z, a2x, a2y, a2z, nax, nay, naz)) return true;

    return false;
  }

  function meshesPenetrate(meshA, offA, meshB) {
    const ox = offA ? offA[0] : 0, oy = offA ? offA[1] : 0, oz = offA ? offA[2] : 0;
    const aB = meshA.bbox, bB = meshB.bbox;
    if (aB[0] + ox + COL_EPS >= bB[3] || bB[0] + COL_EPS >= aB[3] + ox ||
        aB[1] + oy + COL_EPS >= bB[4] || bB[1] + COL_EPS >= aB[4] + oy ||
        aB[2] + oz + COL_EPS >= bB[5] || bB[2] + COL_EPS >= aB[5] + oz) {
      return false;
    }
    const ix0 = Math.max(aB[0] + ox, bB[0]) - COL_EPS, iy0 = Math.max(aB[1] + oy, bB[1]) - COL_EPS, iz0 = Math.max(aB[2] + oz, bB[2]) - COL_EPS;
    const ix1 = Math.min(aB[3] + ox, bB[3]) + COL_EPS, iy1 = Math.min(aB[4] + oy, bB[4]) + COL_EPS, iz1 = Math.min(aB[5] + oz, bB[5]) + COL_EPS;

    const candA = [];
    const tbA = meshA.triBox;
    for (let i = 0; i < meshA.nTris; i++) {
      const k = i * 6;
      if (tbA[k] + ox <= ix1 && tbA[k + 3] + ox >= ix0 &&
          tbA[k + 1] + oy <= iy1 && tbA[k + 4] + oy >= iy0 &&
          tbA[k + 2] + oz <= iz1 && tbA[k + 5] + oz >= iz0) {
        candA.push(i);
      }
    }
    if (!candA.length) return false;

    const candB = [];
    const tbB = meshB.triBox;
    for (let j = 0; j < meshB.nTris; j++) {
      const k = j * 6;
      if (tbB[k] <= ix1 && tbB[k + 3] >= ix0 &&
          tbB[k + 1] <= iy1 && tbB[k + 4] >= iy0 &&
          tbB[k + 2] <= iz1 && tbB[k + 5] >= iz0) {
        candB.push(j);
      }
    }
    if (!candB.length) return false;

    for (let p = 0; p < candA.length; p++) {
      const ia = candA[p], ka = ia * 6;
      const ax0 = tbA[ka] + ox - COL_EPS, ay0 = tbA[ka + 1] + oy - COL_EPS, az0 = tbA[ka + 2] + oz - COL_EPS;
      const ax1 = tbA[ka + 3] + ox + COL_EPS, ay1 = tbA[ka + 4] + oy + COL_EPS, az1 = tbA[ka + 5] + oz + COL_EPS;
      for (let q = 0; q < candB.length; q++) {
        const ib = candB[q], kb = ib * 6;
        if (ax0 <= tbB[kb + 3] && ax1 >= tbB[kb] &&
            ay0 <= tbB[kb + 4] && ay1 >= tbB[kb + 1] &&
            az0 <= tbB[kb + 5] && az1 >= tbB[kb + 2]) {
          if (triTriStrict(meshA, ox, oy, oz, ia, meshB, ib)) return true;
        }
      }
    }

    const { verts: vA, tris: tA, norms: nA } = meshA;
    for (let p = 0; p < candA.length; p++) {
      const ia = candA[p], ti = ia * 3;
      const i0 = tA[ti] * 3, i1 = tA[ti + 1] * 3, i2 = tA[ti + 2] * 3;
      const p0x = vA[i0] + ox, p0y = vA[i0 + 1] + oy, p0z = vA[i0 + 2] + oz;
      const p1x = vA[i1] + ox, p1y = vA[i1 + 1] + oy, p1z = vA[i1 + 2] + oz;
      const p2x = vA[i2] + ox, p2y = vA[i2 + 1] + oy, p2z = vA[i2 + 2] + oz;
      const cx = (p0x + p1x + p2x) / 3 - nA[ti] * 5e-4;
      const cy = (p0y + p1y + p2y) / 3 - nA[ti + 1] * 5e-4;
      const cz = (p0z + p1z + p2z) / 3 - nA[ti + 2] * 5e-4;
      if (pointStrictlyInMesh(cx, cy, cz, meshB)) return true;
      if (pointStrictlyInMesh(p0x, p0y, p0z, meshB)) return true;
      if (pointStrictlyInMesh(p1x, p1y, p1z, meshB)) return true;
      if (pointStrictlyInMesh(p2x, p2y, p2z, meshB)) return true;
      if (pointStrictlyInMesh((p0x + p1x) * 0.5, (p0y + p1y) * 0.5, (p0z + p1z) * 0.5, meshB)) return true;
      if (pointStrictlyInMesh((p1x + p2x) * 0.5, (p1y + p2y) * 0.5, (p1z + p2z) * 0.5, meshB)) return true;
      if (pointStrictlyInMesh((p2x + p0x) * 0.5, (p2y + p0y) * 0.5, (p2z + p0z) * 0.5, meshB)) return true;
    }

    const { verts: vB, tris: tB, norms: nB } = meshB;
    for (let q = 0; q < candB.length; q++) {
      const ib = candB[q], ti = ib * 3;
      const i0 = tB[ti] * 3, i1 = tB[ti + 1] * 3, i2 = tB[ti + 2] * 3;
      const p0x = vB[i0], p0y = vB[i0 + 1], p0z = vB[i0 + 2];
      const p1x = vB[i1], p1y = vB[i1 + 1], p1z = vB[i1 + 2];
      const p2x = vB[i2], p2y = vB[i2 + 1], p2z = vB[i2 + 2];
      const cx = (p0x + p1x + p2x) / 3 - nB[ti] * 5e-4;
      const cy = (p0y + p1y + p2y) / 3 - nB[ti + 1] * 5e-4;
      const cz = (p0z + p1z + p2z) / 3 - nB[ti + 2] * 5e-4;
      if (pointStrictlyInMesh(cx, cy, cz, meshA, ox, oy, oz)) return true;
      if (pointStrictlyInMesh(p0x, p0y, p0z, meshA, ox, oy, oz)) return true;
      if (pointStrictlyInMesh(p1x, p1y, p1z, meshA, ox, oy, oz)) return true;
      if (pointStrictlyInMesh(p2x, p2y, p2z, meshA, ox, oy, oz)) return true;
      if (pointStrictlyInMesh((p0x + p1x) * 0.5, (p0y + p1y) * 0.5, (p0z + p1z) * 0.5, meshA, ox, oy, oz)) return true;
      if (pointStrictlyInMesh((p1x + p2x) * 0.5, (p1y + p2y) * 0.5, (p1z + p2z) * 0.5, meshA, ox, oy, oz)) return true;
      if (pointStrictlyInMesh((p2x + p0x) * 0.5, (p2y + p0y) * 0.5, (p2z + p0z) * 0.5, meshA, ox, oy, oz)) return true;
    }

    return false;
  }

  function clearContactFlash() {
    if (!contactFlashGroup) return;
    Viewer.groups.overlay.remove(contactFlashGroup);
    contactFlashGroup.traverse((o) => {
      if (o.isLineSegments2 || (o.material && o.material.isLineMaterial)) Viewer.disposeFat(o);
      else {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
    contactFlashGroup = null;
    Viewer.requestRender();
  }

  function showContactFlash(hitIds) {
    clearContactFlash();
    if (!hitIds || !hitIds.length) return;
    const grp = new THREE.Group();
    grp.userData.noPick = true;
    for (const id of hitIds) {
      const n = Viewer.nodes.get(id);
      if (!n || !n.obj || !n.mesh || !n.mesh.geometry) continue;
      const m = new THREE.Mesh(
        n.mesh.geometry.clone(),
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.22,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      m.matrixAutoUpdate = false;
      m.matrix.copy(n.obj.matrix);
      m.renderOrder = 42;
      grp.add(m);
      if (n.data && n.data.lines && n.data.lines.length >= 6) {
        const edge = Viewer.makeFat(n.data.lines, 0xf59e0b, 2.8, { depthTest: false, opacity: 0.95, order: 45 });
        edge.matrixAutoUpdate = false;
        edge.matrix.copy(n.obj.matrix);
        grp.add(edge);
      }
    }
    if (grp.children.length) {
      Viewer.groups.overlay.add(grp);
      contactFlashGroup = grp;
      Viewer.requestRender();
    }
  }

  function beginDragCheck(movingIds) {
    clearContactFlash();
    lastDragStop = null;
    const movSet = new Set(Array.isArray(movingIds) ? movingIds : []);
    const moving = [];
    for (const id of movSet) {
      const n = Viewer.nodes.get(id);
      if (!n || n.role === 'hole' || !n.obj.visible || n.allBodiesHidden) continue;
      const local = extractLocalMesh(n);
      if (!local) continue;
      const startMat = Model.worldMatrix(App.doc, id).clone();
      moving.push({ id, local, worldMesh: buildWorldMesh(local, startMat), startMat });
    }
    const obstacles = [];
    for (const it of (App.doc && App.doc.items) || []) {
      if (!it || it.hidden || it.role === 'hole' || movSet.has(it.id) || App.mergedInto(it.id)) continue;
      const n = Viewer.nodes.get(it.id);
      if (!n || n.role === 'hole' || !n.obj.visible || n.allBodiesHidden) continue;
      const local = extractLocalMesh(n);
      if (!local) continue;
      const mat = Model.worldMatrix(App.doc, it.id).clone();
      obstacles.push({ id: it.id, worldMesh: buildWorldMesh(local, mat) });
    }
    const initialOverlap = new Set();
    for (const obs of obstacles) {
      for (const mv of moving) {
        if (meshesPenetrate(mv.worldMesh, null, obs.worldMesh)) {
          initialOverlap.add(obs.id);
          break;
        }
      }
    }
    return {
      moving,
      obstacles,
      initialOverlap,
      lastDx: 0,
      lastDy: 0,
      lastDz: 0,
      stopped: false,
      hitIds: [],
    };
  }

  function checkOffsetHits(ctx, dx, dy, dz) {
    const off = [dx, dy, dz];
    const hits = [];
    for (const obs of ctx.obstacles) {
      let col = false;
      for (const mv of ctx.moving) {
        if (meshesPenetrate(mv.worldMesh, off, obs.worldMesh)) {
          col = true;
          break;
        }
      }
      if (col) {
        if (!ctx.initialOverlap.has(obs.id)) hits.push(obs.id);
      } else if (ctx.initialOverlap.has(obs.id)) {
        ctx.initialOverlap.delete(obs.id);
      }
    }
    return hits;
  }

  function sweptHitInterval(aB, dx0, dy0, dz0, ddx, ddy, ddz, bB) {
    let tMin = 0, tMax = 1;
    const axes = [
      [aB[0] + dx0, aB[3] + dx0, ddx, bB[0], bB[3]],
      [aB[1] + dy0, aB[4] + dy0, ddy, bB[1], bB[4]],
      [aB[2] + dz0, aB[5] + dz0, ddz, bB[2], bB[5]],
    ];
    for (const [minA, maxA, d, minB, maxB] of axes) {
      if (Math.abs(d) < 1e-12) {
        if (maxA <= minB + COL_EPS || minA >= maxB - COL_EPS) return null;
      } else {
        let t1 = (minB - maxA) / d;
        let t2 = (maxB - minA) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return null;
      }
    }
    return [clamp(tMin, 0, 1), clamp(tMax, 0, 1)];
  }

  function sweepSegmentOffset(ctx, dx0, dy0, dz0, dx1, dy1, dz1) {
    const ddx = dx1 - dx0, ddy = dy1 - dy0, ddz = dz1 - dz0;
    if (Math.hypot(ddx, ddy, ddz) < 1e-6) {
      const h0 = checkOffsetHits(ctx, dx1, dy1, dz1);
      return { u: h0.length ? 0 : 1, stopped: h0.length > 0, hitIds: h0 };
    }
    const samples = [0, 1];
    for (const obs of ctx.obstacles) {
      if (ctx.initialOverlap.has(obs.id)) continue;
      for (const mv of ctx.moving) {
        const iv = sweptHitInterval(mv.worldMesh.bbox, dx0, dy0, dz0, ddx, ddy, ddz, obs.worldMesh.bbox);
        if (!iv) continue;
        const [u0, u1] = iv;
        for (let k = 0; k <= 6; k++) samples.push(u0 + ((u1 - u0) * k) / 6);
      }
    }
    samples.sort((a, b) => a - b);
    const uniq = [];
    for (const s of samples) {
      if (!uniq.length || s - uniq[uniq.length - 1] > 1e-5) uniq.push(s);
    }
    let lastFreeU = 0;
    let firstHitU = null;
    let firstHits = [];
    for (let i = 1; i < uniq.length; i++) {
      const u = uniq[i];
      const hits = checkOffsetHits(ctx, dx0 + ddx * u, dy0 + ddy * u, dz0 + ddz * u);
      if (hits.length) {
        firstHitU = u;
        firstHits = hits;
        break;
      }
      lastFreeU = u;
    }
    if (firstHitU == null) return { u: 1, stopped: false, hitIds: [] };
    let lo = lastFreeU, hi = firstHitU, hitIds = firstHits;
    for (let it = 0; it < 16; it++) {
      const mid = (lo + hi) * 0.5;
      const hits = checkOffsetHits(ctx, dx0 + ddx * mid, dy0 + ddy * mid, dz0 + ddz * mid);
      if (hits.length) { hi = mid; hitIds = hits; } else { lo = mid; }
    }
    return { u: lo, stopped: true, hitIds };
  }

  function recordDragStop(ctx, stopped, hitIds) {
    ctx.stopped = !!stopped;
    ctx.hitIds = hitIds ? hitIds.slice() : [];
    if (ctx.stopped) {
      lastDragStop = { stopped: true, hitIds: ctx.hitIds.slice(), dx: ctx.lastDx, dy: ctx.lastDy, dz: ctx.lastDz };
      showContactFlash(ctx.hitIds);
    } else {
      lastDragStop = null;
      clearContactFlash();
    }
  }

  function clampDragXY(ctx, targetDx, targetDy) {
    if (!ctx || !ctx.moving.length || !ctx.obstacles.length) return { dx: targetDx, dy: targetDy, stopped: false, hitIds: [] };
    if (checkOffsetHits(ctx, ctx.lastDx, ctx.lastDy, ctx.lastDz).length) {
      ctx.lastDx = 0; ctx.lastDy = 0;
    }
    const res = sweepSegmentOffset(ctx, ctx.lastDx, ctx.lastDy, ctx.lastDz, targetDx, targetDy, ctx.lastDz);
    let nx = ctx.lastDx + (targetDx - ctx.lastDx) * res.u;
    let ny = ctx.lastDy + (targetDy - ctx.lastDy) * res.u;
    let stopped = res.stopped;
    let hitIds = res.hitIds;
    if (stopped && Math.abs(targetDx - nx) > 1e-4 && Math.abs(targetDy - ny) > 1e-4) {
      const rx = sweepSegmentOffset(ctx, nx, ny, ctx.lastDz, targetDx, ny, ctx.lastDz);
      if (rx.u > 1e-4) nx += (targetDx - nx) * rx.u;
      const ry = sweepSegmentOffset(ctx, nx, ny, ctx.lastDz, nx, targetDy, ctx.lastDz);
      if (ry.u > 1e-4) ny += (targetDy - ny) * ry.u;
    }
    ctx.lastDx = round(nx, 4);
    ctx.lastDy = round(ny, 4);
    recordDragStop(ctx, stopped, hitIds);
    return { dx: ctx.lastDx, dy: ctx.lastDy, stopped, hitIds };
  }

  function clampDragZ(ctx, targetDz) {
    if (!ctx || !ctx.moving.length || !ctx.obstacles.length) return { dz: targetDz, stopped: false, hitIds: [] };
    if (checkOffsetHits(ctx, ctx.lastDx, ctx.lastDy, ctx.lastDz).length) ctx.lastDz = 0;
    const res = sweepSegmentOffset(ctx, ctx.lastDx, ctx.lastDy, ctx.lastDz, ctx.lastDx, ctx.lastDy, targetDz);
    ctx.lastDz = round(ctx.lastDz + (targetDz - ctx.lastDz) * res.u, 4);
    recordDragStop(ctx, res.stopped, res.hitIds);
    return { dz: ctx.lastDz, stopped: res.stopped, hitIds: res.hitIds };
  }

  function checkMatricesHits(ctx, matMap) {
    if (!ctx || !ctx.moving.length || !ctx.obstacles.length) return [];
    const built = [];
    for (const mv of ctx.moving) {
      const mat = matMap.get(mv.id);
      if (mat) built.push(buildWorldMesh(mv.local, mat));
    }
    const hits = [];
    for (const obs of ctx.obstacles) {
      let col = false;
      for (const wm of built) {
        if (meshesPenetrate(wm, null, obs.worldMesh)) { col = true; break; }
      }
      if (col) {
        if (!ctx.initialOverlap.has(obs.id)) hits.push(obs.id);
      } else if (ctx.initialOverlap.has(obs.id)) {
        ctx.initialOverlap.delete(obs.id);
      }
    }
    return hits;
  }

  function clampDragEval(ctx, fromVal, toVal, evalMatricesFn) {
    if (!ctx || !ctx.moving.length || !ctx.obstacles.length || Math.abs(toVal - fromVal) < 1e-7) {
      if (ctx) recordDragStop(ctx, false, []);
      return { val: toVal, stopped: false, hitIds: [] };
    }
    const N = 20;
    let lastFree = fromVal;
    let firstHit = null;
    let firstHits = [];
    for (let k = 1; k <= N; k++) {
      const v = fromVal + ((toVal - fromVal) * k) / N;
      const hits = checkMatricesHits(ctx, evalMatricesFn(v));
      if (hits.length) {
        firstHit = v;
        firstHits = hits;
        break;
      }
      lastFree = v;
    }
    if (firstHit == null) {
      recordDragStop(ctx, false, []);
      return { val: toVal, stopped: false, hitIds: [] };
    }
    let lo = lastFree, hi = firstHit, hitIds = firstHits;
    for (let it = 0; it < 16; it++) {
      const mid = (lo + hi) * 0.5;
      const hits = checkMatricesHits(ctx, evalMatricesFn(mid));
      if (hits.length) { hi = mid; hitIds = hits; } else { lo = mid; }
    }
    recordDragStop(ctx, true, hitIds);
    return { val: lo, stopped: true, hitIds };
  }

  function checkCurrentWorldHits(ctx) {
    if (!ctx || !ctx.moving.length || !ctx.obstacles.length) return [];
    const matMap = new Map();
    for (const mv of ctx.moving) {
      matMap.set(mv.id, Model.worldMatrix(App.doc, mv.id));
    }
    return checkMatricesHits(ctx, matMap);
  }

  function setDragStopState(ctx, stopped, hitIds) {
    if (!ctx) return;
    recordDragStop(ctx, stopped, hitIds);
  }

  function endDragCheck(ctx) {
    clearContactFlash();
    if (ctx) { ctx.stopped = false; ctx.hitIds = []; }
  }

  function formatVol(mm3) {
    if (!(mm3 >= 0)) return '0 mm³';
    if (Units.key() !== 'mm') return Units.fmtVolU(mm3);
    return `${fmtFixed(mm3, mm3 < 1 ? 2 : 1)} mm³`;
  }

  function formatDist(mm) {
    if (!(mm >= 0)) return '0 mm';
    if (Units.key() !== 'mm') return Units.fmtLenU(mm, 2);
    return `${fmtFixed(mm, mm < 1 ? 2 : 1)} mm`;
  }

  function clearHighlight() {
    if (!highlightGroup) return;
    Viewer.groups.overlay.remove(highlightGroup);
    highlightGroup.traverse((o) => {
      if (o.isLineSegments2 || (o.material && o.material.isLineMaterial)) Viewer.disposeFat(o);
      else {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
    highlightGroup = null;
    Viewer.requestRender();
  }

  function addMarker(grp, at, radius, colorHex = 0xe5484d) {
    if (!Array.isArray(at) || at.length < 3) return;
    const R0 = clamp(radius || 2.5, 1.4, 8);
    const R1 = R0 + Math.max(0.9, R0 * 0.25);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(R0, R1, 40),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.96, depthTest: false, side: THREE.DoubleSide })
    );
    ring.position.set(at[0], at[1], at[2]);
    ring.quaternion.copy(Viewer.activeCamera.quaternion);
    ring.renderOrder = 47;
    grp.add(ring);
  }

  function buildOverlapGroup(pair) {
    const grp = new THREE.Group();
    const b = Array.isArray(pair.bbox) && pair.bbox.length >= 6 ? pair.bbox : null;
    const diag = b ? Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) : 20;

    if (pair.mesh && pair.mesh.vertices && pair.mesh.vertices.length >= 9 && pair.mesh.triangles && pair.mesh.triangles.length >= 3) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pair.mesh.vertices, 3));
      if (pair.mesh.normals && pair.mesh.normals.length === pair.mesh.vertices.length) {
        geo.setAttribute('normal', new THREE.BufferAttribute(pair.mesh.normals, 3));
      } else {
        geo.computeVertexNormals();
      }
      geo.setIndex(new THREE.BufferAttribute(pair.mesh.triangles, 1));

      const surfaceMesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xe5484d,
          transparent: true,
          opacity: 0.72,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          side: THREE.DoubleSide,
        })
      );
      surfaceMesh.renderOrder = 43;
      grp.add(surfaceMesh);

      const xrayMesh = new THREE.Mesh(
        geo.clone(),
        new THREE.MeshBasicMaterial({
          color: 0xe5484d,
          transparent: true,
          opacity: 0.4,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      xrayMesh.renderOrder = 44;
      grp.add(xrayMesh);

      if (pair.mesh.lines && pair.mesh.lines.length >= 6) {
        grp.add(Viewer.makeFat(pair.mesh.lines, 0xe5484d, 3.2, { depthTest: false, opacity: 0.96, order: 46 }));
      }
      if (diag < 3 && pair.center) addMarker(grp, pair.center, clamp(diag * 0.9, 1.5, 6));
      return grp;
    }

    if (b) {
      const [x0, y0, z0, x1, y1, z1] = b;
      const boxPos = [
        x0, y0, z0, x1, y0, z0, x1, y0, z0, x1, y1, z0, x1, y1, z0, x0, y1, z0, x0, y1, z0, x0, y0, z0,
        x0, y0, z1, x1, y0, z1, x1, y0, z1, x1, y1, z1, x1, y1, z1, x0, y1, z1, x0, y1, z1, x0, y0, z1,
        x0, y0, z0, x0, y0, z1, x1, y0, z0, x1, y0, z1, x1, y1, z0, x1, y1, z1, x0, y1, z0, x0, y1, z1,
      ];
      grp.add(Viewer.makeFat(boxPos, 0xe5484d, 3.2, { depthTest: false, opacity: 0.96, order: 46 }));
    }
    const cen = pair.center || (b ? [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2] : null);
    if (cen) {
      addMarker(grp, cen, clamp(diag * 0.35, 1.8, 7));
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.35, clamp(diag * 0.08, 0.35, 1.6)), 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xe5484d, depthTest: false })
      );
      dot.position.set(cen[0], cen[1], cen[2]);
      dot.renderOrder = 48;
      grp.add(dot);
    }
    return grp;
  }

  function focus(idx) {
    if (!last || !Array.isArray(last.pairs) || !last.pairs[idx]) return;
    const pair = last.pairs[idx];
    clearHighlight();
    focused = idx;
    if (bar) {
      for (const btn of bar.querySelectorAll('#clash-check-list [data-clash-idx]')) {
        btn.classList.toggle('active', Number(btn.dataset.clashIdx) === idx);
      }
    }
    highlightGroup = buildOverlapGroup(pair);
    Viewer.groups.overlay.add(highlightGroup);
    Viewer.requestRender();

    const selIds = [pair.a, pair.b].filter((id) => Model.find(App.doc, id));
    if (selIds.length) App.select(selIds);

    const b = Array.isArray(pair.bbox) && pair.bbox.length >= 6 ? pair.bbox : null;
    const at = Array.isArray(pair.center) && pair.center.length >= 3
      ? pair.center
      : b ? [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2] : null;
    if (at) {
      const cen = new THREE.Vector3(at[0], at[1], at[2]);
      const cam = Viewer.activeCamera, ctr = Viewer.controls;
      const dir = cam.position.clone().sub(ctr.target);
      if (dir.lengthSq() < 1e-8) dir.set(0.62, -0.9, 0.7);
      dir.normalize();
      const diag = b ? Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) : 20;
      const span = Math.max(16, diag * 2.2);
      const fov = cam.fov || 45;
      const dist = (span / Math.sin((fov * Math.PI) / 360)) * 1.05;
      Viewer.moveCamera(cen.clone().add(dir.multiplyScalar(dist)), cen);
    }
  }

  async function run(opts = {}) {
    if (!App.doc || !App.doc.items.length) {
      last = { rev: App.revision, pairs: [], checkedCount: 0, totalVolume: 0, errors: [] };
      return last;
    }
    if (typeof Comp !== 'undefined' && Comp.ensureRefs) await Comp.ensureRefs(App.doc);
    const rev = App.revision;
    const res = await Kernel.call('clashes', {
      scene: Model.kernelScene(App.doc),
      probes: [],
      skipPairs: [],
      opts: { withMesh: true, minVol: opts.minVol ?? 0.05 },
    });
    const labelOf = (id) => {
      const f = Model.find(App.doc, id);
      return f ? Model.label(f.item) : 'Teil';
    };
    const pairs = ((res && res.pairs) || []).map((p) => ({
      ...p,
      nameA: labelOf(p.a),
      nameB: labelOf(p.b),
    }));
    const totalVolume = pairs.reduce((s, p) => s + (p.v || 0), 0);
    last = {
      rev,
      pairs,
      checkedCount: res && res.checkedCount != null ? res.checkedCount : 0,
      totalVolume,
      errors: (res && res.errors) || [],
    };
    return last;
  }

  function showStaleHint() {
    if (!bar) return;
    const body = bar.querySelector('#cc-body');
    if (!body || body.querySelector('.gc-stale')) return;
    body.prepend(h('div', { class: 'gc-stale' }, T('clash.stale')));
  }

  function renderBar() {
    if (!bar) return;
    const titleEl = bar.querySelector('.vb-head .title');
    if (titleEl) titleEl.textContent = T('clash.title');
    const rerunEl = bar.querySelector('#cc-rerun');
    if (rerunEl) { rerunEl.textContent = T('clash.rerun'); rerunEl.dataset.tip = T('clash.rerunTip'); }
    const closeEl = bar.querySelector('#cc-close');
    if (closeEl) { closeEl.setAttribute('aria-label', T('clash.closeAria')); closeEl.dataset.tip = T('common.close'); }

    const body = bar.querySelector('#cc-body');
    if (!body) return;
    body.innerHTML = '';
    if (busy) {
      body.append(h('div', { class: 'hint-box' }, T('clash.busy')));
      return;
    }
    if (!last) return;
    if (last.checkedCount < 2) {
      body.append(h('div', { class: 'hint-box', id: 'clash-check-empty' }, T('clash.needTwo')));
      return;
    }
    if (!last.pairs.length) {
      body.append(h('div', { class: 'chk-row ok', id: 'clash-check-ok' },
        h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, '✓'),
        h('div', { class: 'grow' },
          h('b', null, T('clash.noneTitle')),
          h('span', null, T('clash.noneDesc', { n: last.checkedCount })))));
      return;
    }

    const sumText = last.pairs.length === 1
      ? T('clash.summaryOne', { vol: formatVol(last.totalVolume) })
      : T('clash.summaryMany', { n: last.pairs.length, vol: formatVol(last.totalVolume) });
    body.append(h('div', { class: 'gc-summary' }, sumText));

    const list = h('div', { class: 'chk-list gc-list', id: 'clash-check-list' });
    last.pairs.forEach((pair, idx) => {
      const cls = 'chk-row sk-chk-item bad' + (focused === idx ? ' active' : '');
      const row = h('button', {
        type: 'button',
        class: cls,
        'data-clash-idx': String(idx),
        'data-clash-a': pair.a,
        'data-clash-b': pair.b,
      },
        h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, '✕'),
        h('div', { class: 'grow' },
          h('b', null, `${pair.nameA} – ${pair.nameB}`),
          h('span', { class: 'clash-vol mono' }, formatVol(pair.v))));
      row.onclick = () => focus(idx);
      list.append(row);
    });
    body.append(list);
    body.append(h('div', { class: 'vb-hint' }, T('clash.clickHint')));
  }

  async function open(opts = {}) {
    if (!App.doc || !App.doc.items.length) {
      UI.toast(T('clash.emptyToast'), { icon: 'info' });
      return null;
    }
    const seq = ++runSeq;
    clearHighlight();
    focused = null;
    if (!bar || !bar.isConnected) {
      bar = h('div', { class: 'viewbar clash-check-bar', id: 'clash-check-bar' });
      const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, T('clash.title')));
      const acts = h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } });
      const rerun = h('button', { type: 'button', class: 'btn small ghost', id: 'cc-rerun', 'data-tip': T('clash.rerunTip') }, T('clash.rerun'));
      rerun.onclick = () => open(opts);
      const closeBtn = h('button', { type: 'button', class: 'vb-x', id: 'cc-close', 'aria-label': T('clash.closeAria'), 'data-tip': T('common.close') });
      closeBtn.innerHTML = icon('close');
      closeBtn.onclick = () => close();
      acts.append(rerun, closeBtn);
      head.append(acts);
      bar.append(head, h('div', { id: 'cc-body', style: { display: 'grid', gap: '6px' } }));
      Views.bars().append(bar);
    }
    busy = true;
    sync();
    renderBar();
    try {
      const res = await run(opts);
      if (seq !== runSeq || !bar || !bar.isConnected) return res;
      busy = false;
      renderBar();
      return res;
    } catch (err) {
      if (seq !== runSeq || !bar || !bar.isConnected) return null;
      busy = false;
      const body = bar.querySelector('#cc-body');
      if (body) {
        body.innerHTML = '';
        body.append(h('div', { class: 'chk-row bad' },
          h('span', { class: 'chk-dot' }, '✕'),
          h('div', { class: 'grow' }, h('b', null, T('clash.failTitle')), h('span', null, String((err && err.message) || err)))));
      }
      return null;
    }
  }

  function close() {
    runSeq++;
    busy = false;
    clearHighlight();
    focused = null;
    if (bar) { bar.remove(); bar = null; }
    sync();
  }

  // ---------- BG-18: Abstands-Prüfung („Luft prüfen“) ----------
  function positionClearanceLabel() {
    if (!clLabelEl || !clLabelPos) return;
    const sc = Viewer.toScreen(clLabelPos);
    clLabelEl.style.left = sc.x + 'px';
    clLabelEl.style.top = (sc.y - 22) + 'px';
    clLabelEl.hidden = !!sc.behind;
  }

  function clearClearanceHighlight() {
    if (clHighlight) {
      Viewer.groups.overlay.remove(clHighlight);
      clHighlight.traverse((o) => {
        if (o.isLineSegments2 || (o.material && o.material.isLineMaterial)) Viewer.disposeFat(o);
        else {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        }
      });
      clHighlight = null;
      Viewer.requestRender();
    }
    if (clLabelEl) { clLabelEl.remove(); clLabelEl = null; }
    clLabelPos = null;
  }

  function pairClearanceText(pair) {
    if (!pair) return '';
    if (pair.kind === 'overlap') return `${T('clearance.overlapLabel')} (${formatVol(pair.v || 0)})`;
    if (pair.kind === 'touch' || !(pair.d > 1e-4)) return T('clearance.touchLabel');
    return formatDist(pair.d);
  }

  function focusClearance(idx) {
    if (!clLast || !Array.isArray(clLast.pairs) || !clLast.pairs[idx]) return;
    const pair = clLast.pairs[idx];
    clearClearanceHighlight();
    clFocused = idx;
    if (clBar) {
      for (const btn of clBar.querySelectorAll('#clearance-check-list [data-cl-idx]')) {
        btn.classList.toggle('active', Number(btn.dataset.clIdx) === idx);
      }
    }
    const colHex = pair.kind === 'overlap' ? 0xe5484d : 0xf59e0b;
    const grp = new THREE.Group();
    grp.userData.noPick = true;
    const pa = Array.isArray(pair.pa) && pair.pa.length >= 3 ? pair.pa : null;
    const pb = Array.isArray(pair.pb) && pair.pb.length >= 3 ? pair.pb : null;
    const cen = Array.isArray(pair.center) && pair.center.length >= 3
      ? pair.center
      : (pa && pb ? [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2] : null);
    const spanDist = pa && pb ? Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) : 0;
    const dotR = clamp(Math.max(0.28, spanDist * 0.14), 0.28, 1.4);

    if (pa && pb && spanDist > 1e-4) {
      grp.add(Viewer.makeFat([...pa, ...pb], colHex, 4.0, { depthTest: false, opacity: 0.98, order: 46 }));
    }
    for (const pt of [pa, pb]) {
      if (!pt) continue;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(dotR, 14, 10),
        new THREE.MeshBasicMaterial({ color: colHex, depthTest: false })
      );
      dot.position.set(pt[0], pt[1], pt[2]);
      dot.renderOrder = 48;
      grp.add(dot);
    }
    if (cen) {
      addMarker(grp, cen, clamp(Math.max(2.0, spanDist * 1.4), 1.8, 7.5), colHex);
      clLabelPos = new THREE.Vector3(cen[0], cen[1], cen[2]);
      const ov = $('#overlay');
      if (ov) {
        clLabelEl = h('div', { class: 'dimlabel clearance-tag' + (pair.kind === 'overlap' ? ' contact-stop' : '') }, pairClearanceText(pair));
        ov.append(clLabelEl);
        positionClearanceLabel();
      }
    }

    Viewer.groups.overlay.add(grp);
    clHighlight = grp;
    Viewer.requestRender();

    const selIds = [pair.a, pair.b].filter((id) => Model.find(App.doc, id));
    if (selIds.length) App.select(selIds);

    if (cen) {
      const cVec = new THREE.Vector3(cen[0], cen[1], cen[2]);
      const cam = Viewer.activeCamera, ctr = Viewer.controls;
      const dir = cam.position.clone().sub(ctr.target);
      if (dir.lengthSq() < 1e-8) dir.set(0.62, -0.9, 0.7);
      dir.normalize();
      const span = Math.max(16, (clLast.minGap || 1) * 14, spanDist * 16);
      const fov = cam.fov || 45;
      const dist = (span / Math.sin((fov * Math.PI) / 360)) * 1.05;
      Viewer.moveCamera(cVec.clone().add(dir.multiplyScalar(dist)), cVec);
    }
  }

  async function runClearance(opts = {}) {
    const rawGap = opts.minGap != null ? Number(opts.minGap) : clMinGap;
    const minGap = Number.isFinite(rawGap) && rawGap > 0 ? rawGap : 1;
    clMinGap = minGap;
    if (opts.includeTouch != null) clIncludeTouch = !!opts.includeTouch;
    if (!App.doc || !App.doc.items.length) {
      clLast = { rev: App.revision, pairs: [], checkedCount: 0, minGap, includeTouch: clIncludeTouch, errors: [] };
      return clLast;
    }
    if (typeof Comp !== 'undefined' && Comp.ensureRefs) await Comp.ensureRefs(App.doc);
    const rev = App.revision;
    const res = await Kernel.call('clearances', {
      scene: Model.kernelScene(App.doc),
      minGap,
      skipPairs: [],
      opts: { includeTouch: clIncludeTouch },
    });
    const labelOf = (id) => {
      const f = Model.find(App.doc, id);
      return f ? Model.label(f.item) : 'Teil';
    };
    const pairs = ((res && res.pairs) || []).map((p) => ({
      ...p,
      nameA: labelOf(p.a),
      nameB: labelOf(p.b),
    }));
    clLast = {
      rev,
      pairs,
      checkedCount: res && res.checkedCount != null ? res.checkedCount : 0,
      minGap: res && res.minGap != null ? res.minGap : minGap,
      includeTouch: clIncludeTouch,
      errors: (res && res.errors) || [],
    };
    return clLast;
  }

  function showClearanceStaleHint() {
    if (!clBar) return;
    const body = clBar.querySelector('#cl-body');
    if (!body || body.querySelector('.gc-stale')) return;
    body.prepend(h('div', { class: 'gc-stale' }, T('clash.stale')));
  }

  function renderClearanceBar() {
    if (!clBar) return;
    const titleEl = clBar.querySelector('.vb-head .title');
    if (titleEl) titleEl.textContent = T('clearance.title');
    const rerunEl = clBar.querySelector('#cl-rerun');
    if (rerunEl) { rerunEl.textContent = T('clash.rerun'); rerunEl.dataset.tip = T('clearance.rerunTip'); }
    const closeEl = clBar.querySelector('#cl-close');
    if (closeEl) { closeEl.setAttribute('aria-label', T('clearance.closeAria')); closeEl.dataset.tip = T('common.close'); }
    const gapLbl = clBar.querySelector('label[for="cl-min-gap"]');
    if (gapLbl) gapLbl.textContent = T('clearance.minGap');
    const unitEl = clBar.querySelector('#cl-unit');
    if (unitEl) unitEl.textContent = Units.label();
    const goEl = clBar.querySelector('#cl-go');
    if (goEl) goEl.textContent = T('clearance.checkBtn');
    const touchLbl = clBar.querySelector('#cl-touch-txt');
    if (touchLbl) touchLbl.textContent = T('clearance.includeTouch');

    const body = clBar.querySelector('#cl-body');
    if (!body) return;
    body.innerHTML = '';
    if (clBusy) {
      body.append(h('div', { class: 'hint-box' }, T('clearance.busy')));
      return;
    }
    if (!clLast) return;
    if (clLast.checkedCount < 2) {
      body.append(h('div', { class: 'hint-box', id: 'clearance-check-empty' }, T('clash.needTwo')));
      return;
    }
    if (!clLast.pairs.length) {
      body.append(h('div', { class: 'chk-row ok', id: 'clearance-check-ok' },
        h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, '✓'),
        h('div', { class: 'grow' },
          h('b', null, T('clearance.noneTitle')),
          h('span', null, T('clearance.noneDesc', { n: clLast.checkedCount, gap: formatDist(clLast.minGap) })))));
      return;
    }

    const sumText = clLast.pairs.length === 1
      ? T('clearance.summaryOne', { gap: formatDist(clLast.minGap) })
      : T('clearance.summaryMany', { n: clLast.pairs.length, gap: formatDist(clLast.minGap) });
    body.append(h('div', { class: 'gc-summary' }, sumText));

    const list = h('div', { class: 'chk-list gc-list', id: 'clearance-check-list' });
    clLast.pairs.forEach((pair, idx) => {
      const isBad = pair.kind === 'overlap';
      const cls = 'chk-row sk-chk-item ' + (isBad ? 'bad' : 'warn') + (clFocused === idx ? ' active' : '');
      const row = h('button', {
        type: 'button',
        class: cls,
        'data-cl-idx': String(idx),
        'data-cl-a': pair.a,
        'data-cl-b': pair.b,
      },
        h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, isBad ? '✕' : '!'),
        h('div', { class: 'grow' },
          h('b', null, `${pair.nameA} – ${pair.nameB}`),
          h('span', { class: 'clearance-dist mono' + (isBad ? ' bad' : '') }, pairClearanceText(pair))));
      row.onclick = () => focusClearance(idx);
      list.append(row);
    });
    body.append(list);
    body.append(h('div', { class: 'vb-hint' }, T('clearance.clickHint')));
  }

  async function openClearance(opts = {}) {
    if (isSimpleMode()) {
      UI.toast(T('clash.proOnly'), { icon: 'info' });
      return null;
    }
    if (!App.doc || !App.doc.items.length) {
      UI.toast(T('clash.emptyToast'), { icon: 'info' });
      return null;
    }
    if (opts.minGap != null && Number(opts.minGap) > 0) clMinGap = Number(opts.minGap);
    if (opts.includeTouch != null) clIncludeTouch = !!opts.includeTouch;
    const seq = ++clSeq;
    clearClearanceHighlight();
    clFocused = null;
    if (!clBar || !clBar.isConnected) {
      clBar = h('div', { class: 'viewbar clearance-check-bar', id: 'clearance-check-bar' });
      const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, T('clearance.title')));
      const acts = h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } });
      const rerun = h('button', { type: 'button', class: 'btn small ghost', id: 'cl-rerun', 'data-tip': T('clearance.rerunTip') }, T('clash.rerun'));
      rerun.onclick = () => triggerClearanceFromBar();
      const closeBtn = h('button', { type: 'button', class: 'vb-x', id: 'cl-close', 'aria-label': T('clearance.closeAria'), 'data-tip': T('common.close') });
      closeBtn.innerHTML = icon('close');
      closeBtn.onclick = () => closeClearance();
      acts.append(rerun, closeBtn);
      head.append(acts);

      const gapInp = h('input', { type: 'text', id: 'cl-min-gap', value: Units.fmtInput(clMinGap), inputmode: 'decimal' });
      const goBtn = h('button', { type: 'button', class: 'btn small primary', id: 'cl-go' }, T('clearance.checkBtn'));
      const ctrl = h('div', { class: 'cl-ctrl-row' },
        h('label', { for: 'cl-min-gap' }, T('clearance.minGap')),
        h('div', { class: 'inp' }, gapInp, h('span', { class: 'u', id: 'cl-unit' }, Units.label())),
        goBtn
      );
      const touchInp = h('input', { type: 'checkbox', id: 'cl-touch', checked: clIncludeTouch });
      const touchRow = h('label', { class: 'check', style: { fontSize: '12px' } }, touchInp, h('span', { id: 'cl-touch-txt' }, T('clearance.includeTouch')));

      const submitGap = () => triggerClearanceFromBar();
      goBtn.onclick = submitGap;
      touchInp.onchange = () => { clIncludeTouch = touchInp.checked; submitGap(); };
      gapInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitGap(); }
      });

      clBar.append(head, ctrl, touchRow, h('div', { id: 'cl-body', style: { display: 'grid', gap: '6px' } }));
      Views.bars().append(clBar);
    } else {
      const gapInp = clBar.querySelector('#cl-min-gap');
      if (gapInp) gapInp.value = Units.fmtInput(clMinGap);
      const touchInp = clBar.querySelector('#cl-touch');
      if (touchInp) touchInp.checked = clIncludeTouch;
    }

    clBusy = true;
    sync();
    renderClearanceBar();
    try {
      const res = await runClearance({ minGap: clMinGap, includeTouch: clIncludeTouch });
      if (seq !== clSeq || !clBar || !clBar.isConnected) return res;
      clBusy = false;
      renderClearanceBar();
      return res;
    } catch (err) {
      if (seq !== clSeq || !clBar || !clBar.isConnected) return null;
      clBusy = false;
      const body = clBar.querySelector('#cl-body');
      if (body) {
        body.innerHTML = '';
        body.append(h('div', { class: 'chk-row bad' },
          h('span', { class: 'chk-dot' }, '✕'),
          h('div', { class: 'grow' }, h('b', null, T('clash.failTitle')), h('span', null, String((err && err.message) || err)))));
      }
      return null;
    }
  }

  function triggerClearanceFromBar() {
    if (!clBar) return openClearance();
    const inp = clBar.querySelector('#cl-min-gap');
    const touchInp = clBar.querySelector('#cl-touch');
    const V = Model.vars(App.doc).v;
    const parsed = inp ? Units.parseLen(inp.value.trim(), V, { expr: true }) : { ok: false };
    const nextGap = parsed.ok && parsed.num > 0 ? parsed.num : clMinGap;
    if (inp && parsed.ok && parsed.num > 0) inp.value = Units.fmtInput(nextGap);
    return openClearance({ minGap: nextGap, includeTouch: touchInp ? touchInp.checked : clIncludeTouch });
  }

  function closeClearance() {
    clSeq++;
    clBusy = false;
    clearClearanceHighlight();
    clFocused = null;
    if (clBar) { clBar.remove(); clBar = null; }
    sync();
  }

  function init() {
    App.on('mode', () => {
      if (App.mode !== 'model') { close(); closeClearance(); clearContactFlash(); }
    });
    App.on('doc', () => {
      clearHighlight();
      focused = null;
      if (bar && last && last.rev !== App.revision && !busy) showStaleHint();
      clearClearanceHighlight();
      clFocused = null;
      if (clBar && clLast && clLast.rev !== App.revision && !clBusy) showClearanceStaleHint();
      sync();
    });
    Viewer.on('camera', () => positionClearanceLabel());
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.on) {
      ViewPrefs.on('change', () => {
        if (isSimpleMode()) { closeClearance(); clearContactFlash(); }
        sync();
      });
    }
    I18n.on('change', () => {
      if (bar && bar.isConnected) renderBar();
      if (clBar && clBar.isConnected) renderClearanceBar();
    });
  }

  return {
    init, open, run, close, focus, clearHighlight, formatVol, formatDist, sync,
    stopOnContact, setStopOnContact, toggleStopOnContact,
    beginDragCheck, clampDragXY, clampDragZ, clampDragEval, checkCurrentWorldHits, setDragStopState, endDragCheck,
    openClearance, runClearance, closeClearance, focusClearance, clearClearanceHighlight,
    get active() { return !!bar; },
    get last() { return last; },
    get focused() { return focused; },
    get hasHighlight() { return !!(highlightGroup && highlightGroup.children.length); },
    get clearanceActive() { return !!clBar; },
    get clearanceLast() { return clLast; },
    get clearanceFocused() { return clFocused; },
    get hasClearanceHighlight() { return !!(clHighlight && clHighlight.children.length); },
    get lastDragStop() { return lastDragStop ? { ...lastDragStop, hitIds: lastDragStop.hitIds.slice() } : null; },
  };
})();
