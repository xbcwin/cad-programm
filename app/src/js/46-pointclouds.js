// ================= Punktwolken aus CSV / XYZ / PLY (IO-12, IO-14) =================
const PointClouds = (() => {
  const MAX_POINTS = 100000;
  const MAX_SKETCH_POINTS = 5000;
  const HEX_RE = /^#[0-9a-f]{6}$/i;
  let sel = null;

  const list = (doc = App.doc) => (doc && Array.isArray(doc.pointClouds) ? doc.pointClouds : []);
  const find = (id, doc = App.doc) => list(doc).find((pc) => pc && pc.id === id) || null;

  function bboxOf(pc) {
    if (!pc || !Array.isArray(pc.points) || !pc.points.length) return null;
    const s = Number(pc.scale) > 0 ? Number(pc.scale) : 1;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity;
    let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const p of pc.points) {
      if (!Array.isArray(p) || p.length < 3) continue;
      const x = p[0] * s, y = p[1] * s, z = p[2] * s;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (!Number.isFinite(x0)) return null;
    return { min: [x0, y0, z0], max: [x1, y1, z1], size: [x1 - x0, y1 - y0, z1 - z0] };
  }

  function sanitizePoints(points, colors) {
    const outPts = [];
    const outCols = Array.isArray(colors) && colors.length === (points ? points.length : 0) ? [] : null;
    const n = Math.min(MAX_POINTS, Array.isArray(points) ? points.length : 0);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (!Array.isArray(p) || p.length < 2) continue;
      const x = Number(p[0]), y = Number(p[1]), z = p.length >= 3 ? Number(p[2]) : 0;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      outPts.push([round(x, 4), round(y, 4), round(z, 4)]);
      if (outCols) {
        const c = colors[i];
        if (Array.isArray(c) && c.length >= 3) {
          outCols.push([
            clamp(Math.round(Number(c[0]) || 0), 0, 255),
            clamp(Math.round(Number(c[1]) || 0), 0, 255),
            clamp(Math.round(Number(c[2]) || 0), 0, 255),
          ]);
        } else {
          outCols.push([63, 127, 214]);
        }
      }
    }
    return { points: outPts, colors: outCols };
  }

  function add(points, opts = {}) {
    const clean = sanitizePoints(points, opts.colors);
    if (!clean.points.length) return null;
    const scale = Number(opts.scale) > 0 ? Number(opts.scale) : 1;
    const size = clamp(Math.round(Number(opts.size) || 5), 2, 14);
    const color = typeof opts.color === 'string' && HEX_RE.test(opts.color) ? opts.color.toLowerCase() : '#3f7fd6';
    const pc = {
      id: uid('pc'),
      name: String(opts.name || `Punktwolke ${list().length + 1}`).trim() || 'Punktwolke',
      file: String(opts.file || '').trim(),
      points: clean.points,
      colors: clean.colors,
      color,
      size,
      scale,
      hidden: false,
    };
    App.change(opts.undoLabel || 'Punktwolke importiert', (doc) => {
      doc.pointClouds = doc.pointClouds || [];
      doc.pointClouds.push(pc);
    });
    select(pc.id);
    if (opts.fit !== false && typeof Viewer !== 'undefined' && Viewer.fit) {
      setTimeout(() => { if (find(pc.id)) Viewer.fit(null, false); }, 50);
    }
    return find(pc.id) || pc;
  }

  function set(id, patch, label = 'Punktwolke geändert') {
    if (!find(id)) return false;
    App.change(label, (doc) => {
      const pc = find(id, doc);
      if (!pc) return false;
      if (patch.name != null) {
        const nm = String(patch.name).trim();
        if (nm) pc.name = nm;
      }
      if (patch.color !== undefined && typeof patch.color === 'string' && HEX_RE.test(patch.color)) {
        pc.color = patch.color.toLowerCase();
      }
      if (patch.size !== undefined && Number.isFinite(Number(patch.size))) {
        pc.size = clamp(Math.round(Number(patch.size)), 2, 14);
      }
      if (patch.scale !== undefined && Number(patch.scale) > 0) {
        pc.scale = Number(patch.scale);
      }
      if (patch.hidden !== undefined) {
        pc.hidden = !!patch.hidden;
      }
    });
    draw();
    if (typeof Panels !== 'undefined' && Panels.renderLeft) Panels.renderLeft();
    if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
    return true;
  }

  function remove(id) {
    if (!find(id)) return false;
    if (sel === id) sel = null;
    App.change('Punktwolke gelöscht', (doc) => {
      doc.pointClouds = list(doc).filter((pc) => pc.id !== id);
    });
    draw();
    if (typeof Panels !== 'undefined' && Panels.renderLeft) Panels.renderLeft();
    if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
    return true;
  }

  function select(id) {
    sel = id || null;
    if (sel) {
      if (typeof App !== 'undefined' && App.clearSelection) App.clearSelection();
      if (typeof Datums !== 'undefined') {
        if (Datums.select) Datums.select(null);
        if (Datums.selectAxis) Datums.selectAxis(null);
        if (Datums.selectPoint) Datums.selectPoint(null);
        if (Datums.selectCsys) Datums.selectCsys(null);
      }
      if (typeof Measure !== 'undefined' && Measure.select) Measure.select(null);
      if (typeof Joints !== 'undefined' && Joints.select) Joints.select(null);
    }
    draw();
    if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
    if (typeof Panels !== 'undefined' && Panels.renderLeft) Panels.renderLeft();
  }

  function toSketchPoints(id) {
    const pc = find(id);
    if (!pc || !pc.points || !pc.points.length) return 0;
    const s = Number(pc.scale) > 0 ? Number(pc.scale) : 1;
    const pts = pc.points.slice(0, MAX_SKETCH_POINTS);
    const ents = pts.map((p) => ({
      id: uid('e'),
      type: 'point',
      a: [round(p[0] * s, 4), round(p[1] * s, 4)],
    }));
    if (!Sketch.active) Sketch.startOnPlane('XY');
    const added = Sketch.insertEnts(ents);
    if (added) {
      const truncNote = pc.points.length > MAX_SKETCH_POINTS ? ` (erste ${MAX_SKETCH_POINTS})` : '';
      UI.toast(`${added} Skizzenpunkte aus „${pc.name}“ eingefügt${truncNote}.`, { icon: 'check', ms: 3500 });
    }
    return added;
  }

  function draw() {
    const g = typeof Viewer !== 'undefined' && Viewer.groups ? Viewer.groups.pointClouds : null;
    if (!g) return;
    for (const c of [...g.children]) {
      g.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    for (const pc of list()) {
      if (pc.hidden || !Array.isArray(pc.points) || !pc.points.length) continue;
      const s = Number(pc.scale) > 0 ? Number(pc.scale) : 1;
      const n = pc.points.length;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const p = pc.points[i];
        pos[i * 3] = p[0] * s;
        pos[i * 3 + 1] = p[1] * s;
        pos[i * 3 + 2] = (p[2] || 0) * s;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const hasColors = Array.isArray(pc.colors) && pc.colors.length === n && pc.id !== sel;
      if (hasColors) {
        const colArr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const c = pc.colors[i] || [63, 127, 214];
          colArr[i * 3] = c[0] / 255;
          colArr[i * 3 + 1] = c[1] / 255;
          colArr[i * 3 + 2] = c[2] / 255;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      }
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const col = pc.id === sel ? '#f08c00' : (typeof pc.color === 'string' && HEX_RE.test(pc.color) ? pc.color : '#3f7fd6');
      const mat = new THREE.PointsMaterial({
        size: pc.size || 5,
        sizeAttenuation: false,
        vertexColors: hasColors,
        color: hasColors ? 0xffffff : new THREE.Color(col),
      });
      const pts = new THREE.Points(geo, mat);
      pts.userData.pointCloud = pc.id;
      pts.renderOrder = 20;
      g.add(pts);
    }
    Viewer.requestRender();
  }

  function treeSection() {
    const pcs = list();
    if (!pcs.length) return null;
    const sec = h('div', { class: 'datum-tree pointcloud-tree', id: 'pointcloud-tree' }, h('div', { class: 'section-h' }, T('left.tree.pointClouds')));
    for (const pc of pcs) {
      const row = h('div', { class: 'tree-row pointcloud-row' + (pc.id === sel ? ' sel' : '') + (pc.hidden ? ' dim' : ''), 'data-pointcloud': pc.id });
      const ic = h('span', { class: 'swatch point' });
      ic.innerHTML = icon('point');
      if (typeof pc.color === 'string' && HEX_RE.test(pc.color)) ic.style.color = pc.color;
      row.append(
        ic,
        h('span', { class: 'nm' }, pc.name),
        h('span', { class: 'sub mono' }, `${pc.points.length} ${T('pc.pointsShort')}`),
      );
      row.onclick = () => select(pc.id === sel ? null : pc.id);
      sec.append(row);
    }
    return sec;
  }

  function renderPanel(body) {
    const pc = find(sel);
    if (!pc) return false;
    const w = h('div', { class: 'props', 'data-help': 'pointCloudImport' });
    const nm = h('input', { id: 'pc-name', value: pc.name, 'aria-label': T('common.name') });
    nm.addEventListener('change', () => { const v = nm.value.trim(); if (v) set(pc.id, { name: v }, 'Punktwolke umbenannt'); });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));

    const bb = bboxOf(pc);
    const bbTxt = bb
      ? `${Units.fmtLen(bb.size[0], 2)} × ${Units.fmtLen(bb.size[1], 2)} × ${Units.fmtLen(bb.size[2], 2)} ${Units.label()}`
      : '–';
    w.append(h('div', { class: 'mini-list' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('pc.file')), h('b', { class: 'mono', id: 'pc-file' }, pc.file || '–')),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('pc.count')), h('b', { class: 'mono', id: 'pc-count' }, String(pc.points.length))),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('pc.bbox')), h('b', { class: 'mono', id: 'pc-bbox' }, bbTxt)),
    ));

    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'pc-scale',
      label: T('pc.scale'),
      value: String(pc.scale || 1),
      options: [['1', T('unit.mmShort')], ['10', T('unit.cmShort')], ['25.4', T('unit.inShort')], ['1000', T('unit.mShort')]],
      onChange: (v) => set(pc.id, { scale: parseFloat(v) || 1 }, 'Punktwolke-Einheit geändert'),
    }));
    fl.append(UI.numField({
      id: 'pc-size',
      label: T('pc.size'),
      value: pc.size || 5,
      unit: 'px',
      expr: false,
      int: true,
      min: 2,
      max: 14,
      onCommit: (v) => set(pc.id, { size: v }, 'Punktgröße geändert'),
    }));
    w.append(fl);

    const colInp = h('input', { type: 'color', id: 'pc-color', value: pc.color || '#3f7fd6', 'aria-label': T('pc.color') });
    colInp.addEventListener('change', () => set(pc.id, { color: colInp.value }, 'Punktwolke-Farbe geändert'));
    w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('pc.color')), colInp));

    const toSkBtn = h('button', { type: 'button', class: 'btn primary', id: 'pc-to-sketch', 'data-help': 'pointCloudImport' });
    toSkBtn.innerHTML = icon('sketch') + esc(T('pc.toSketch'));
    toSkBtn.onclick = () => toSketchPoints(pc.id);

    const hideBtn = h('button', { type: 'button', class: 'btn', id: 'pc-toggle-hide' });
    hideBtn.innerHTML = icon(pc.hidden ? 'eye' : 'eyeOff') + esc(pc.hidden ? T('common.show') : T('common.hide'));
    hideBtn.onclick = () => set(pc.id, { hidden: !pc.hidden }, pc.hidden ? 'Punktwolke eingeblendet' : 'Punktwolke ausgeblendet');

    const delBtn = h('button', { type: 'button', class: 'btn ghost', id: 'pc-delete' });
    delBtn.innerHTML = icon('trash') + esc(T('common.delete'));
    delBtn.onclick = () => remove(pc.id);

    w.append(h('div', { class: 'btn-row' }, toSkBtn, hideBtn, delBtn));
    w.append(h('div', { class: 'hint-box' }, T('pc.hint')));
    body.append(w);
    return true;
  }

  function init() {
    App.on('doc', () => {
      if (sel && !find(sel)) sel = null;
      draw();
    });
    App.on('selection', () => {
      if (App.sel.length && sel) {
        sel = null;
        draw();
      }
    });
    Viewer.on('theme', draw);
    draw();
  }

  return {
    init, list, find, bboxOf, add, set, remove, select, toSketchPoints, draw, treeSection, renderPanel,
    get selected() { return sel; },
  };
})();
