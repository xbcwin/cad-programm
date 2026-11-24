// ================= Durchdringungen der ganzen Baugruppe als Liste (BG-10) =================
const ClashCheck = (() => {
  let bar = null, last = null, focused = null, highlightGroup = null, busy = false, runSeq = 0;

  function sync() {
    const btn = $('#t-clashes');
    if (btn) btn.classList.toggle('active', !!bar);
    if (typeof GeomCheck !== 'undefined' && GeomCheck.sync) GeomCheck.sync();
  }

  function formatVol(mm3) {
    if (!(mm3 >= 0)) return '0 mm³';
    if (Units.key() !== 'mm') return Units.fmtVolU(mm3);
    return `${fmtFixed(mm3, mm3 < 1 ? 2 : 1)} mm³`;
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

  function addMarker(grp, at, radius) {
    if (!Array.isArray(at) || at.length < 3) return;
    const R0 = clamp(radius || 2.5, 1.4, 8);
    const R1 = R0 + Math.max(0.9, R0 * 0.25);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(R0, R1, 40),
      new THREE.MeshBasicMaterial({ color: 0xe5484d, transparent: true, opacity: 0.96, depthTest: false, side: THREE.DoubleSide })
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

  function init() {
    App.on('mode', () => { if (App.mode !== 'model') close(); });
    App.on('doc', () => {
      clearHighlight();
      focused = null;
      if (bar && last && last.rev !== App.revision && !busy) showStaleHint();
    });
    I18n.on('change', () => {
      if (bar && bar.isConnected) renderBar();
    });
  }

  return {
    init, open, run, close, focus, clearHighlight, formatVol,
    get active() { return !!bar; },
    get last() { return last; },
    get focused() { return focused; },
    get hasHighlight() { return !!(highlightGroup && highlightGroup.children.length); },
  };
})();
