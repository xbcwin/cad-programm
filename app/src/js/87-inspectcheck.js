// ================= Prüfen: Kleinster Innenradius (PF-11) & Symmetrie prüfen (PF-16) =================
const InnerRadius = (() => {
  let st = null;

  function sync() {
    if (typeof GeomCheck !== 'undefined' && GeomCheck.sync) GeomCheck.sync();
  }

  function disposeMesh(mesh) {
    if (!mesh) return;
    Viewer.groups.overlay.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }

  function clearFocus() {
    if (!st || !st.focusGroup) return;
    Viewer.groups.overlay.remove(st.focusGroup);
    st.focusGroup.traverse((o) => {
      if (o.isLineSegments2 || (o.material && o.material.isLineMaterial)) Viewer.disposeFat(o);
      else {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
    st.focusGroup = null;
    st.focused = null;
  }

  function disposeVisuals() {
    if (!st) return;
    disposeMesh(st.redMesh); st.redMesh = null;
    disposeMesh(st.okMesh); st.okMesh = null;
    clearFocus();
  }

  function buildOverlayMesh(pos, norms, color, opacity, renderOrder) {
    if (!pos || !pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.5,
      metalness: 0.05,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = renderOrder;
    mesh.userData.noPick = true;
    Viewer.groups.overlay.add(mesh);
    return mesh;
  }

  function kindLabel(f) {
    if (f.kind === 'hole') return T('radius.kindHole');
    if (f.kind === 'corner') return T('radius.kindCorner');
    if (f.kind === 'cone') return T('radius.kindCone');
    if (f.kind === 'freeform') return T('radius.kindFreeform');
    return T('radius.kindFillet');
  }

  function focus(idx) {
    if (!st || !st.info || !st.info.faces || !st.info.faces[idx]) return;
    const f = st.info.faces[idx];
    clearFocus();
    st.focused = idx;
    if (st.bar) {
      for (const btn of st.bar.querySelectorAll('#ir-list [data-ir-idx]')) {
        btn.classList.toggle('active', Number(btn.dataset.irIdx) === idx);
      }
    }
    const grp = new THREE.Group();
    const col = f.status === 'tooSmall' ? 0xe5484d : 0x2fb36d;
    const ov = Viewer.faceOverlay(f.id, f.faceIdx, col, 0.72);
    if (ov) { ov.renderOrder = 44; grp.add(ov); }
    if (Array.isArray(f.center) && f.center.length >= 3) {
      const R0 = clamp(Math.max(1.5, f.r * 1.4), 1.5, 7);
      const R1 = R0 + Math.max(0.8, R0 * 0.25);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R0, R1, 40),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.96, depthTest: false, side: THREE.DoubleSide })
      );
      ring.position.set(f.center[0], f.center[1], f.center[2]);
      ring.quaternion.copy(Viewer.activeCamera.quaternion);
      ring.renderOrder = 47;
      grp.add(ring);
    }
    Viewer.groups.overlay.add(grp);
    st.focusGroup = grp;
    Viewer.requestRender();

    if (Array.isArray(f.center) && f.center.length >= 3) {
      const cen = new THREE.Vector3(f.center[0], f.center[1], f.center[2]);
      const cam = Viewer.activeCamera, ctr = Viewer.controls;
      const dir = cam.position.clone().sub(ctr.target);
      if (dir.lengthSq() < 1e-8) dir.set(1, -1, 1);
      dir.normalize();
      const box = Viewer.baseBox(f.id);
      const bodyDiag = box ? box.getSize(new THREE.Vector3()).length() : 24;
      const span = Math.max(12, bodyDiag * 0.55);
      const fov = cam.fov || 45;
      const dist = (span / Math.sin((fov * Math.PI) / 360)) * 1.05;
      Viewer.moveCamera(cen.clone().add(dir.multiplyScalar(dist)), cen);
    }
  }

  function updateUI() {
    if (!st || !st.bar) return;
    const r = st.info;
    const u = Units.label();
    const diaEl = st.bar.querySelector('#ir-dia');
    if (diaEl) diaEl.textContent = `Ø ${Units.fmtLenU(st.cutterRadius * 2, 2)}`;
    const unitEl = st.bar.querySelector('#ir-unit');
    if (unitEl) unitEl.textContent = u;
    const badEl = st.bar.querySelector('#ir-bad-count');
    const okEl = st.bar.querySelector('#ir-ok-count');
    const minEl = st.bar.querySelector('#ir-min-val');
    const sumEl = st.bar.querySelector('#ir-summary');
    const listEl = st.bar.querySelector('#ir-list');

    if (badEl) badEl.textContent = String(r ? r.tooSmallCount : 0);
    if (okEl) okEl.textContent = String(r ? r.okCount : 0);
    if (minEl) minEl.textContent = r && r.minRadius != null ? 'R ' + Units.fmtLenU(r.minRadius, 2) : '–';

    if (sumEl) {
      if (!r || !r.totalCount) {
        sumEl.textContent = T('radius.none');
      } else if (r.tooSmallCount > 0) {
        sumEl.textContent = T('radius.hasTooSmall', {
          n: r.tooSmallCount,
          min: Units.fmtLenU(r.minRadius, 2),
          cutter: Units.fmtLenU(st.cutterRadius, 2),
        });
      } else {
        sumEl.textContent = T('radius.allOk', {
          min: Units.fmtLenU(r.minRadius, 2),
          cutter: Units.fmtLenU(st.cutterRadius, 2),
        });
      }
    }

    if (listEl) {
      listEl.innerHTML = '';
      if (r && r.faces && r.faces.length) {
        r.faces.forEach((f, idx) => {
          const itemFound = Model.find(App.doc, f.id);
          const itemName = itemFound ? Model.label(itemFound.item) : 'Körper';
          const isBad = f.status === 'tooSmall';
          const row = h('button', {
            type: 'button',
            class: 'chk-row sk-chk-item ' + (isBad ? 'bad' : 'ok') + (st.focused === idx ? ' active' : ''),
            'data-ir-idx': String(idx),
            'data-ir-status': f.status,
          },
            h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, isBad ? '✕' : '✓'),
            h('div', { class: 'grow' },
              h('b', null, `R ${Units.fmtLenU(f.r, 2)} (Ø ${Units.fmtLenU(f.r * 2, 2)}) · ${kindLabel(f)}`),
              h('span', null, `${itemName} · ${isBad ? T('radius.rowTooSmall') : T('radius.rowOk')}`)));
          row.onclick = () => focus(idx);
          listEl.append(row);
        });
      }
    }
  }

  function syncInputs() {
    if (!st || !st.bar) return;
    const rng = st.bar.querySelector('#ir-cutter-range');
    const num = st.bar.querySelector('#ir-cutter');
    const holesCb = st.bar.querySelector('#ir-holes');
    if (rng && document.activeElement !== rng) rng.value = String(clamp(st.cutterRadius, 0.5, 15));
    if (num && document.activeElement !== num) num.value = String(round(st.cutterRadius, 2));
    if (holesCb) holesCb.checked = !!st.includeHoles;
  }

  function draw() {
    if (!st) return;
    disposeVisuals();
    const res = Viewer.innerRadiusAnalysis({ cutterRadius: st.cutterRadius, includeHoles: st.includeHoles });
    st.info = res;
    if (res.tooSmallPos && res.tooSmallPos.length) {
      st.redMesh = buildOverlayMesh(res.tooSmallPos, res.tooSmallNorms, '#e0483b', 0.86, 18);
    }
    if (res.okPos && res.okPos.length) {
      st.okMesh = buildOverlayMesh(res.okPos, res.okNorms, '#2fb36d', 0.4, 17);
    }
    updateUI();
    Viewer.requestRender();
  }

  function buildBar() {
    if (!st) return;
    if (st.bar) st.bar.remove();
    const barEl = h('div', {
      class: 'viewbar radius-bar',
      id: 'inner-radius-bar',
      role: 'toolbar',
      'aria-label': T('radius.title'),
      'data-help': 'innerRadius',
    });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, T('radius.title')));
    const closeBtn = h('button', {
      type: 'button',
      class: 'vb-x',
      id: 'ir-close',
      'aria-label': T('radius.closeAria'),
      'data-tip': T('common.close'),
    });
    closeBtn.innerHTML = icon('close');
    closeBtn.onclick = () => close();
    head.append(closeBtn);

    const rng = h('input', {
      type: 'range',
      id: 'ir-cutter-range',
      min: 0.5,
      max: 15,
      step: 0.5,
      value: clamp(st.cutterRadius, 0.5, 15),
      'aria-label': T('radius.cutterAria'),
    });
    const num = h('input', {
      type: 'number',
      id: 'ir-cutter',
      class: 'vb-num',
      min: 0.1,
      max: 100,
      step: 0.5,
      value: round(st.cutterRadius, 2),
      'aria-label': T('radius.cutterAria'),
    });
    const setVal = (raw) => {
      const v = parseFloat(String(raw).replace(',', '.'));
      if (!isFinite(v) || v <= 0) return;
      const next = clamp(v, 0.1, 100);
      if (Math.abs(next - st.cutterRadius) < 1e-6) { syncInputs(); return; }
      st.cutterRadius = next;
      syncInputs();
      draw();
    };
    rng.oninput = () => setVal(rng.value);
    num.oninput = () => setVal(num.value);
    num.onchange = () => setVal(num.value);
    num.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { setVal(num.value); num.blur(); }
    };

    const holesCb = h('input', { type: 'checkbox', id: 'ir-holes' });
    holesCb.checked = !!st.includeHoles;
    holesCb.onchange = () => { st.includeHoles = holesCb.checked; draw(); };

    const legend = h('div', { class: 'draft-legend ir-legend' },
      h('div', { class: 'draft-chip', id: 'ir-bad-chip' }, h('span', { class: 'draft-dot bad' }), h('span', { class: 'draft-lbl' }, T('radius.badLabel')), h('b', { class: 'mono', id: 'ir-bad-count' }, '0')),
      h('div', { class: 'draft-chip', id: 'ir-ok-chip' }, h('span', { class: 'draft-dot ok' }), h('span', { class: 'draft-lbl' }, T('radius.okLabel')), h('b', { class: 'mono', id: 'ir-ok-count' }, '0')),
      h('div', { class: 'draft-chip', id: 'ir-min-chip' }, h('span', { class: 'draft-lbl' }, T('radius.minLabel')), h('b', { class: 'mono', id: 'ir-min-val' }, '–')));

    const listEl = h('div', { class: 'chk-list ir-list', id: 'ir-list' });

    barEl.append(
      head,
      h('div', { class: 'vb-row' },
        h('span', { class: 'vb-l' }, T('radius.cutterLabel')),
        rng,
        num,
        h('span', { class: 'vb-u', id: 'ir-unit' }, Units.label()),
        h('span', { class: 'vb-hint mono', id: 'ir-dia' }, '')),
      h('div', { class: 'vb-row' }, h('label', { class: 'vb-hint', 'data-tip': T('radius.holesTip') }, holesCb, ' ', T('radius.includeHoles'))),
      legend,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'ir-summary' }, '')),
      listEl
    );
    Views.bars().append(barEl);
    st.bar = barEl;
    syncInputs();
    updateUI();
  }

  function open(opts = {}) {
    const cutterRaw = opts.cutterRadius ?? (st ? st.cutterRadius : 3);
    const cutterRadius = clamp(Number(cutterRaw) || 3, 0.1, 100);
    const includeHoles = opts.includeHoles !== undefined ? !!opts.includeHoles : (st ? st.includeHoles : true);
    if (st) {
      st.cutterRadius = cutterRadius;
      st.includeHoles = includeHoles;
      syncInputs();
      draw();
      sync();
      return true;
    }
    st = { cutterRadius, includeHoles, bar: null, redMesh: null, okMesh: null, focusGroup: null, info: null, focused: null };
    buildBar();
    draw();
    sync();
    return true;
  }

  function close() {
    if (!st) return false;
    disposeVisuals();
    if (st.bar) st.bar.remove();
    st = null;
    sync();
    Viewer.requestRender();
    return false;
  }

  function toggle(opts = {}) {
    return st ? close() : open(opts);
  }

  function setCutterRadius(r) {
    if (!st) return open({ cutterRadius: r });
    const v = Number(r);
    if (!isFinite(v) || v <= 0) return false;
    st.cutterRadius = clamp(v, 0.1, 100);
    syncInputs();
    draw();
    return true;
  }

  function setIncludeHoles(on) {
    if (!st) return open({ includeHoles: !!on });
    st.includeHoles = !!on;
    syncInputs();
    draw();
    return true;
  }

  function init() {
    App.on('results', () => { if (st) draw(); });
    App.on('mode', () => { if (App.mode !== 'model') close(); });
    App.on('doc', () => { if (st) updateUI(); });
    I18n.on('change', () => {
      if (!st) return;
      buildBar();
      updateUI();
    });
  }

  return {
    init, open, toggle, close, focus, setCutterRadius, setIncludeHoles,
    get active() { return !!st; },
    get info() {
      if (!st) return null;
      const r = st.info;
      return {
        active: true,
        cutterRadius: st.cutterRadius,
        includeHoles: st.includeHoles,
        minRadius: r ? r.minRadius : null,
        tooSmallCount: r ? r.tooSmallCount : 0,
        okCount: r ? r.okCount : 0,
        totalCount: r ? r.totalCount : 0,
        tooSmallArea: r ? r.tooSmallArea : 0,
        okArea: r ? r.okArea : 0,
        hasRedMesh: !!st.redMesh,
        hasOkMesh: !!st.okMesh,
        focused: st.focused,
        faces: r && r.faces ? r.faces.map((f) => ({ ...f })) : [],
      };
    },
  };
})();

const SymmetryCheck = (() => {
  let bar = null, planeKey = 'YZ', customPlane = null, off = 0;
  let last = null, focused = null, busy = false, runSeq = 0;
  let overlayGroup = null, planeGroup = null, focusGroup = null, picking = null;

  function sync() {
    if (typeof GeomCheck !== 'undefined' && GeomCheck.sync) GeomCheck.sync();
  }

  function disposeGroup(grp) {
    if (!grp) return;
    Viewer.groups.overlay.remove(grp);
    grp.traverse((o) => {
      if (o.isLineSegments2 || (o.material && o.material.isLineMaterial)) Viewer.disposeFat(o);
      else {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
  }

  function clearOverlay() {
    disposeGroup(overlayGroup); overlayGroup = null;
    disposeGroup(focusGroup); focusGroup = null;
    focused = null;
    Viewer.requestRender();
  }

  function clearPlaneVis() {
    disposeGroup(planeGroup); planeGroup = null;
    Viewer.requestRender();
  }

  function stopFacePick() {
    if (!picking) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', picking.down, true);
    window.removeEventListener('keydown', picking.key, true);
    cv.style.cursor = '';
    UI.hint(null);
    picking = null;
    const btn = bar && bar.querySelector('#sym-pick-face');
    if (btn) btn.classList.remove('active');
  }

  function startFacePick() {
    if (!bar) return;
    if (picking) { stopFacePick(); return; }
    const cv = Viewer.canvas;
    const btn = bar.querySelector('#sym-pick-face');
    if (btn) btn.classList.add('active');
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      const f = hit && hit.faceIdx >= 0 && hit.node && hit.node.data && hit.node.data.faces ? hit.node.data.faces[hit.faceIdx] : null;
      if (!f || f.t !== 'PLANE' || !f.n || !f.c) {
        UI.toast(T('sym.pickFaceNeedPlane'), { icon: 'info' });
        return;
      }
      const M = hit.node.obj.matrixWorld;
      const wn = new THREE.Vector3(...f.n).transformDirection(M).normalize().toArray();
      const wc = new THREE.Vector3(...f.c).applyMatrix4(M).toArray();
      stopFacePick();
      customPlane = { o: wc, n: wn };
      planeKey = 'face';
      off = 0;
      syncInputs();
      open({ keepSettings: true });
    };
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        stopFacePick();
      }
    };
    picking = { down, key };
    cv.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    cv.style.cursor = 'crosshair';
    UI.hint(T('sym.pickFaceHint'));
  }

  function resolvePlane() {
    const baseNormals = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] };
    if (baseNormals[planeKey]) {
      const n = baseNormals[planeKey];
      return { origin: [n[0] * off, n[1] * off, n[2] * off], normal: n.slice(), key: planeKey };
    }
    if (planeKey.startsWith('datum:')) {
      const did = planeKey.slice(6);
      const d = (App.doc.datums || []).find((x) => x.id === did);
      if (d && d.plane && d.plane.n && d.plane.o) {
        const l = Math.hypot(d.plane.n[0], d.plane.n[1], d.plane.n[2]) || 1;
        const n = [d.plane.n[0] / l, d.plane.n[1] / l, d.plane.n[2] / l];
        const o = [d.plane.o[0] + n[0] * off, d.plane.o[1] + n[1] * off, d.plane.o[2] + n[2] * off];
        return { origin: o, normal: n, key: planeKey };
      }
      planeKey = 'YZ';
    }
    if (planeKey === 'face' && customPlane) {
      const n = customPlane.n;
      const o = [customPlane.o[0] + n[0] * off, customPlane.o[1] + n[1] * off, customPlane.o[2] + n[2] * off];
      return { origin: o, normal: n.slice(), key: 'face' };
    }
    planeKey = 'YZ';
    return { origin: [off, 0, 0], normal: [1, 0, 0], key: 'YZ' };
  }

  function addMeshGroup(grp, mesh, hexColor, orderBase) {
    if (!mesh || !mesh.vertices || mesh.vertices.length < 9 || !mesh.triangles || mesh.triangles.length < 3) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));
    if (mesh.normals && mesh.normals.length === mesh.vertices.length) {
      geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    } else {
      geo.computeVertexNormals();
    }
    geo.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));

    const surf = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: hexColor,
        transparent: true,
        opacity: 0.68,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
      })
    );
    surf.renderOrder = orderBase;
    grp.add(surf);

    const xray = new THREE.Mesh(
      geo.clone(),
      new THREE.MeshBasicMaterial({
        color: hexColor,
        transparent: true,
        opacity: 0.32,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    xray.renderOrder = orderBase + 1;
    grp.add(xray);

    if (mesh.lines && mesh.lines.length >= 6) {
      grp.add(Viewer.makeFat(mesh.lines, hexColor, 2.8, { depthTest: false, opacity: 0.92, order: orderBase + 2 }));
    }
  }

  function drawPlaneVis(origin, normal, bbox) {
    clearPlaneVis();
    if (!bar) return;
    let span = 40;
    let cen = new THREE.Vector3(...origin);
    if (bbox && bbox.length >= 6) {
      const dx = bbox[3] - bbox[0], dy = bbox[4] - bbox[1], dz = bbox[5] - bbox[2];
      span = Math.max(16, Math.hypot(dx, dy, dz) * 0.72);
      const bc = new THREE.Vector3((bbox[0] + bbox[3]) / 2, (bbox[1] + bbox[4]) / 2, (bbox[2] + bbox[5]) / 2);
      const nV = new THREE.Vector3(...normal);
      const dist = bc.clone().sub(cen).dot(nV);
      cen = bc.sub(nV.multiplyScalar(dist));
    }
    const nV = new THREE.Vector3(...normal).normalize();
    const ref = Math.abs(nV.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const u = new THREE.Vector3().crossVectors(ref, nV).normalize();
    const v = new THREE.Vector3().crossVectors(nV, u).normalize();
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => cen.clone().addScaledVector(u, a * span).addScaledVector(v, b * span));

    const grp = new THREE.Group();
    grp.userData.noPick = true;
    const fill = new THREE.Mesh(
      new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]),
      new THREE.MeshBasicMaterial({ color: 0x6f42c1, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
    );
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(corners),
      new THREE.LineBasicMaterial({ color: 0x6f42c1, transparent: true, opacity: 0.75 })
    );
    fill.renderOrder = 19; edge.renderOrder = 20;
    grp.add(fill, edge);
    Viewer.groups.overlay.add(grp);
    planeGroup = grp;
    Viewer.requestRender();
  }

  function drawResultVis(res) {
    clearOverlay();
    if (!res) return;
    drawPlaneVis(res.origin, res.normal, res.bbox);
    if (res.symmetric) return;
    const grp = new THREE.Group();
    grp.userData.noPick = true;
    if (res.onlyOrigMesh) addMeshGroup(grp, res.onlyOrigMesh, 0xe0483b, 41);
    if (res.onlyMirrMesh) addMeshGroup(grp, res.onlyMirrMesh, 0x2b7de9, 44);
    if (grp.children.length) {
      Viewer.groups.overlay.add(grp);
      overlayGroup = grp;
    }
    Viewer.requestRender();
  }

  function focus(idx) {
    if (!last || !Array.isArray(last.deviations) || !last.deviations[idx]) return;
    const dev = last.deviations[idx];
    disposeGroup(focusGroup); focusGroup = null;
    focused = idx;
    if (bar) {
      for (const btn of bar.querySelectorAll('#sym-list [data-sym-idx]')) {
        btn.classList.toggle('active', Number(btn.dataset.symIdx) === idx);
      }
    }
    const grp = new THREE.Group();
    const b = dev.bbox;
    const diag = b ? Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) : 16;
    const R0 = clamp(diag * 0.45, 1.8, 8);
    const R1 = R0 + Math.max(0.9, R0 * 0.25);
    for (const [pt, col] of [[dev.center, 0xe0483b], [dev.mirrorCenter, 0x2b7de9]]) {
      if (!Array.isArray(pt) || pt.length < 3) continue;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R0, R1, 40),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.96, depthTest: false, side: THREE.DoubleSide })
      );
      ring.position.set(pt[0], pt[1], pt[2]);
      ring.quaternion.copy(Viewer.activeCamera.quaternion);
      ring.renderOrder = 48;
      grp.add(ring);
    }
    Viewer.groups.overlay.add(grp);
    focusGroup = grp;
    Viewer.requestRender();

    if (Array.isArray(dev.center) && dev.center.length >= 3) {
      const cen = new THREE.Vector3(dev.center[0], dev.center[1], dev.center[2]);
      const cam = Viewer.activeCamera, ctr = Viewer.controls;
      const dir = cam.position.clone().sub(ctr.target);
      if (dir.lengthSq() < 1e-8) dir.set(0.62, -0.9, 0.7);
      dir.normalize();
      const span = Math.max(16, diag * 2.4);
      const fov = cam.fov || 45;
      const dist = (span / Math.sin((fov * Math.PI) / 360)) * 1.05;
      Viewer.moveCamera(cen.clone().add(dir.multiplyScalar(dist)), cen);
    }
  }

  function formatVol(mm3) {
    if (!(mm3 >= 0)) return '0 mm³';
    if (Units.key() !== 'mm') return Units.fmtVolU(mm3);
    return `${fmtFixed(mm3, mm3 < 1 ? 2 : 1)} mm³`;
  }

  function populatePlaneOptions() {
    if (!bar) return;
    const sel = bar.querySelector('#sym-plane');
    if (!sel) return;
    sel.innerHTML = '';
    sel.append(
      h('option', { value: 'YZ' }, T('sym.planeYZ')),
      h('option', { value: 'XZ' }, T('sym.planeXZ')),
      h('option', { value: 'XY' }, T('sym.planeXY'))
    );
    for (const d of (App.doc && App.doc.datums) || []) {
      if (!d || d.hidden || !d.plane) continue;
      sel.append(h('option', { value: 'datum:' + d.id }, d.name || T('sym.planeDatum')));
    }
    if (planeKey === 'face' && customPlane) {
      sel.append(h('option', { value: 'face' }, T('sym.planeFace')));
    }
    if ([...sel.options].some((o) => o.value === planeKey)) sel.value = planeKey;
    else { planeKey = 'YZ'; sel.value = 'YZ'; }
  }

  function syncInputs() {
    if (!bar) return;
    populatePlaneOptions();
    const offEl = bar.querySelector('#sym-off');
    if (offEl && document.activeElement !== offEl) offEl.value = Units.fmtInput(off);
    const unitEl = bar.querySelector('#sym-unit');
    if (unitEl) unitEl.textContent = Units.label();
  }

  function renderBar() {
    if (!bar) return;
    const titleEl = bar.querySelector('.vb-head .title');
    if (titleEl) titleEl.textContent = T('sym.title');
    const rerunEl = bar.querySelector('#sym-rerun');
    if (rerunEl) { rerunEl.textContent = T('clash.rerun'); rerunEl.dataset.tip = T('sym.rerunTip'); }
    const closeEl = bar.querySelector('#sym-close');
    if (closeEl) { closeEl.setAttribute('aria-label', T('sym.closeAria')); closeEl.dataset.tip = T('common.close'); }
    syncInputs();

    const body = bar.querySelector('#sym-body');
    if (!body) return;
    body.innerHTML = '';
    if (busy) {
      body.append(h('div', { class: 'hint-box' }, T('sym.busy')));
      return;
    }
    if (!last) return;
    if (!last.checkedCount) {
      body.append(h('div', { class: 'hint-box', id: 'sym-empty' }, T('sym.empty')));
      return;
    }
    if (last.symmetric) {
      body.append(h('div', { class: 'chk-row ok', id: 'sym-status', 'data-sym': 'ok' },
        h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, '✓'),
        h('div', { class: 'grow' },
          h('b', null, T('sym.okTitle')),
          h('span', null, T('sym.okDesc', { n: last.checkedCount })))));
      return;
    }

    body.append(h('div', { class: 'chk-row bad', id: 'sym-status', 'data-sym': 'bad' },
      h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, '✕'),
      h('div', { class: 'grow' },
        h('b', null, T('sym.badTitle')),
        h('span', null, T('sym.badDesc', { pct: fmtFixed(last.symPercent, 1), vol: formatVol(last.diffVolume) })))));

    body.append(h('div', { class: 'sym-legend' },
      h('span', { class: 'sym-leg-item' }, h('span', { class: 'sym-dot orig' }), T('sym.legendOrig')),
      h('span', { class: 'sym-leg-item' }, h('span', { class: 'sym-dot mirr' }), T('sym.legendMirr'))));

    if (last.deviations && last.deviations.length) {
      const list = h('div', { class: 'chk-list gc-list', id: 'sym-list' });
      last.deviations.forEach((dev, idx) => {
        const cls = 'chk-row sk-chk-item bad' + (focused === idx ? ' active' : '');
        const row = h('button', {
          type: 'button',
          class: cls,
          'data-sym-idx': String(idx),
        },
          h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, String(idx + 1)),
          h('div', { class: 'grow' },
            h('b', null, T('sym.devTitle', { n: idx + 1, vol: formatVol(dev.volume) })),
            h('span', { class: 'mono' },
              `X ${Units.fmtLen(dev.center[0], 1)} · Y ${Units.fmtLen(dev.center[1], 1)} · Z ${Units.fmtLen(dev.center[2], 1)} ${Units.label()}`)));
        row.onclick = () => focus(idx);
        list.append(row);
      });
      body.append(list);
      body.append(h('div', { class: 'vb-hint' }, T('sym.clickHint')));
    }
  }

  async function run(opts = {}) {
    if (!App.doc || !App.doc.items.length) {
      const pl = resolvePlane();
      last = {
        rev: App.revision, checkedCount: 0, symmetric: true, totalVolume: 0, diffVolume: 0, symPercent: 100,
        bbox: null, planeKey: pl.key, off, origin: pl.origin, normal: pl.normal,
        hasOrigMesh: false, hasMirrMesh: false, onlyOrigMesh: null, onlyMirrMesh: null, deviations: [], errors: [],
      };
      clearOverlay();
      clearPlaneVis();
      return last;
    }
    if (typeof Comp !== 'undefined' && Comp.ensureRefs) await Comp.ensureRefs(App.doc);
    const pl = resolvePlane();
    const rev = App.revision;
    const res = await Kernel.call('checkSymmetry', {
      scene: Model.kernelScene(App.doc),
      opts: { origin: pl.origin, normal: pl.normal, tolVol: opts.tolVol, tolRel: opts.tolRel },
    });
    last = {
      rev,
      checkedCount: res ? res.checkedCount || 0 : 0,
      symmetric: !!(res && res.symmetric),
      totalVolume: res ? res.totalVolume || 0 : 0,
      diffVolume: res ? res.diffVolume || 0 : 0,
      symPercent: res && res.symPercent != null ? res.symPercent : 100,
      bbox: res ? res.bbox : null,
      planeKey: pl.key,
      off,
      origin: res && res.origin ? res.origin : pl.origin,
      normal: res && res.normal ? res.normal : pl.normal,
      hasOrigMesh: !!(res && res.onlyOrigMesh),
      hasMirrMesh: !!(res && res.onlyMirrMesh),
      onlyOrigMesh: res ? res.onlyOrigMesh : null,
      onlyMirrMesh: res ? res.onlyMirrMesh : null,
      deviations: (res && res.deviations) || [],
      errors: (res && res.errors) || [],
    };
    return last;
  }

  function centerOffset() {
    let b = new THREE.Box3();
    for (const n of Viewer.nodes.values()) {
      if (!n.obj.visible || n.allBodiesHidden || n.role === 'hole' || !n.mesh) continue;
      const nb = Viewer.baseBox(n.id);
      if (nb) b.union(nb);
    }
    if (b.isEmpty()) return false;
    const cen = b.getCenter(new THREE.Vector3());
    const savedOff = off;
    off = 0;
    const pl = resolvePlane();
    off = round(
      (cen.x - pl.origin[0]) * pl.normal[0] +
      (cen.y - pl.origin[1]) * pl.normal[1] +
      (cen.z - pl.origin[2]) * pl.normal[2],
      2
    );
    if (!isFinite(off)) off = savedOff;
    syncInputs();
    if (bar && bar.isConnected) open({ keepSettings: true });
    return true;
  }

  function buildBar() {
    if (bar) bar.remove();
    bar = h('div', {
      class: 'viewbar sym-bar',
      id: 'sym-check-bar',
      role: 'toolbar',
      'aria-label': T('sym.title'),
      'data-help': 'symmetryCheck',
    });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, T('sym.title')));
    const acts = h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } });
    const rerun = h('button', { type: 'button', class: 'btn small ghost', id: 'sym-rerun', 'data-tip': T('sym.rerunTip') }, T('clash.rerun'));
    rerun.onclick = () => open({ keepSettings: true });
    const closeBtn = h('button', { type: 'button', class: 'vb-x', id: 'sym-close', 'aria-label': T('sym.closeAria'), 'data-tip': T('common.close') });
    closeBtn.innerHTML = icon('close');
    closeBtn.onclick = () => close();
    acts.append(rerun, closeBtn);
    head.append(acts);

    const planeSel = h('select', { id: 'sym-plane', class: 'vb-sel', style: { flex: '1', minWidth: '0' }, 'aria-label': T('sym.planeAria') });
    planeSel.onchange = () => {
      planeKey = planeSel.value;
      if (planeKey !== 'face') off = 0;
      syncInputs();
      open({ keepSettings: true });
    };
    const pickBtn = h('button', { type: 'button', class: 'btn small', id: 'sym-pick-face', 'data-tip': T('sym.pickFaceTip') }, T('sym.pickFace'));
    pickBtn.onclick = () => startFacePick();

    const offIn = h('input', { type: 'text', id: 'sym-off', class: 'vb-num', inputmode: 'decimal', value: Units.fmtInput(off), 'aria-label': T('sym.offAria') });
    const applyOff = () => {
      const p = Units.parseLen(offIn.value, Model.vars(App.doc).v, { expr: false });
      if (!p.ok) return;
      const next = round(p.num, 3);
      if (Math.abs(next - off) < 1e-6) { syncInputs(); return; }
      off = next;
      syncInputs();
      open({ keepSettings: true });
    };
    offIn.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { applyOff(); offIn.blur(); }
    };
    offIn.onchange = () => applyOff();

    const centerBtn = h('button', { type: 'button', class: 'btn small', id: 'sym-center', 'data-tip': T('sym.centerTip') }, T('sym.center'));
    centerBtn.onclick = () => centerOffset();

    bar.append(
      head,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, T('sym.planeLabel')), planeSel, pickBtn),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, T('sym.offLabel')), offIn, h('span', { class: 'vb-u', id: 'sym-unit' }, Units.label()), centerBtn),
      h('div', { id: 'sym-body', style: { display: 'grid', gap: '6px' } })
    );
    Views.bars().append(bar);
    syncInputs();
  }

  async function open(opts = {}) {
    if (!opts.fromResults && (!App.doc || !App.doc.items.length)) {
      UI.toast(T('sym.emptyToast'), { icon: 'info' });
      return null;
    }
    if (opts.plane) planeKey = opts.plane;
    if (opts.off != null && isFinite(Number(opts.off))) off = Number(opts.off);

    const seq = ++runSeq;
    clearOverlay();
    if (!bar || !bar.isConnected) buildBar();
    else syncInputs();

    busy = true;
    sync();
    renderBar();
    try {
      const res = await run(opts);
      if (seq !== runSeq || !bar || !bar.isConnected) return res;
      busy = false;
      drawResultVis(res);
      renderBar();
      return res;
    } catch (err) {
      if (seq !== runSeq || !bar || !bar.isConnected) return null;
      busy = false;
      const body = bar.querySelector('#sym-body');
      if (body) {
        body.innerHTML = '';
        body.append(h('div', { class: 'chk-row bad' },
          h('span', { class: 'chk-dot' }, '✕'),
          h('div', { class: 'grow' }, h('b', null, T('sym.failTitle')), h('span', null, String((err && err.message) || err)))));
      }
      return null;
    }
  }

  function setPlane(key, nextOff = 0) {
    planeKey = key || 'YZ';
    off = Number(nextOff) || 0;
    syncInputs();
    return open({ keepSettings: true });
  }

  function close() {
    runSeq++;
    busy = false;
    stopFacePick();
    clearOverlay();
    clearPlaneVis();
    if (bar) { bar.remove(); bar = null; }
    sync();
  }

  function init() {
    App.on('mode', () => { if (App.mode !== 'model') close(); });
    App.on('results', () => {
      if (bar && bar.isConnected) open({ keepSettings: true, fromResults: true });
    });
    App.on('doc', () => {
      if (bar && bar.isConnected) syncInputs();
    });
    I18n.on('change', () => {
      if (bar && bar.isConnected) renderBar();
    });
  }

  return {
    init, open, run, close, setPlane, centerOffset, focus,
    get active() { return !!bar; },
    get busy() { return busy; },
    get last() {
      if (!last) return null;
      const { onlyOrigMesh, onlyMirrMesh, ...rest } = last;
      return {
        ...rest,
        deviations: (last.deviations || []).map((d) => ({ ...d })),
      };
    },
    get hasOverlay() { return !!(overlayGroup && overlayGroup.children.length); },
  };
})();
