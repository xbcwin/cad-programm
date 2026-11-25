// ================= Geometrie-Prüfung (PF-08): kaputte Flächen, winzige Kanten, Selbstschnitte =================
const GeomCheck = (() => {
  let bar = null, last = null, focused = null, highlightGroup = null, busy = false, runSeq = 0;

  function sync() {
    const b = $('#t-check');
    if (b) b.classList.toggle('active', !!bar || (typeof ClashCheck !== 'undefined' && ClashCheck.active) || (typeof Measure !== 'undefined' && (Measure.draftActive || Measure.silhouetteActive)) || (typeof InnerRadius !== 'undefined' && InnerRadius.active) || (typeof SymmetryCheck !== 'undefined' && SymmetryCheck.active) || (typeof Versions !== 'undefined' && !!Versions.comparing));
  }

  function menu(anchor) {
    UI.menu(anchor, [
      { label: T('menu.check.geom'), icon: 'target', id: 'check-geom', help: 'geomCheck', run: () => open() },
      { label: T('menu.check.clashes'), icon: 'boolIntersect', id: 'check-clashes', help: 'clashCheck', run: () => ClashCheck.open() },
      { label: T('menu.check.weak'), icon: 'warn', id: 'check-weak', help: 'weakSpots', run: () => Weak.dialog() },
      '-',
      { label: T('menu.check.thin'), icon: 'ruler', id: 'check-thin', help: 'thinWalls', run: () => Views.thin() },
      { label: T('menu.check.overhang'), icon: 'overhang', id: 'check-overhang', help: 'overhang', run: () => Views.overhang() },
      { label: (typeof Measure !== 'undefined' && Measure.draftActive ? '✓ ' : '') + T('menu.check.draft'), icon: 'chamfer', id: 'check-draft', help: 'draftAnalysis', run: () => Measure.draft() },
      { label: (typeof InnerRadius !== 'undefined' && InnerRadius.active ? '✓ ' : '') + T('menu.check.innerRadius'), icon: 'fillet', id: 'check-inner-radius', help: 'innerRadius', run: () => InnerRadius.toggle() },
      { label: (typeof SymmetryCheck !== 'undefined' && SymmetryCheck.active ? '✓ ' : '') + T('menu.check.symmetry'), icon: 'mirror', id: 'check-symmetry', help: 'symmetryCheck', run: () => SymmetryCheck.open() },
      '-',
      { label: (typeof Versions !== 'undefined' && Versions.comparing ? '✓ ' : '') + T('menu.check.compare'), icon: 'compare', id: 'check-compare', help: 'compareBodies', run: () => Versions.openCompare() },
      { label: (typeof Measure !== 'undefined' && Measure.silhouetteActive ? '✓ ' : '') + T('menu.check.silhouette'), icon: 'silhouette2d', id: 'check-silhouette', help: 'silhouetteArea', run: () => Measure.silhouette() },
    ]);
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

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.28, R0 * 0.16), 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xe5484d, depthTest: false })
    );
    dot.position.set(at[0], at[1], at[2]);
    dot.renderOrder = 48;
    grp.add(dot);
  }

  function formatLen(mm) {
    if (!(mm >= 0)) return '0 mm';
    if (Units.key() !== 'mm') return Units.fmtLenU(mm, 4);
    if (mm < 0.001) return '< 0,001 mm';
    return fmt(mm, 4) + ' mm';
  }

  function formatIssue(iss) {
    const nm = iss.itemName || 'Körper';
    if (iss.kind === 'tinyEdge') {
      const lenTxt = formatLen(iss.length);
      return {
        title: `Winzige Kante (${lenTxt}) – ${nm}`,
        text: `Kante #${(iss.edgeIdx ?? 0) + 1} ist kürzer als ${Units.key() !== 'mm' ? Units.fmtLenU(0.01, 4) : '0,01 mm'} (oft durch zwei fast gleiche Maße). Das kann Rundungen oder den Export stören.`,
      };
    }
    if (iss.kind === 'selfIntersect') {
      const detail = iss.faceIdx2 != null && iss.faceIdx2 !== iss.faceIdx
        ? `Fläche #${iss.faceIdx + 1} durchdringt Fläche #${iss.faceIdx2 + 1}.`
        : `Fläche #${(iss.faceIdx ?? 0) + 1} schneidet sich selbst.`;
      return { title: `Sich selbst schneidende Fläche – ${nm}`, text: detail };
    }
    let text;
    if (iss.reason === 'degenerate') text = `Fläche #${(iss.faceIdx ?? 0) + 1} ist winzig oder zusammengefallen (Fläche nahe 0).`;
    else if (iss.reason === 'shell') text = 'Die Außenhülle dieses Körpers ist nicht sauber geschlossen oder ungültig.';
    else if (iss.reason === 'invalidEdge') text = 'Eine Kante hat keine gültige Geometrie.';
    else text = `Fläche #${(iss.faceIdx ?? 0) + 1} hat einen Geometriefehler (OpenCascade-Prüfung fehlgeschlagen).`;
    return {
      title: iss.faceIdx >= 0 ? `Kaputte Fläche – ${nm}` : `Kaputte Geometrie – ${nm}`,
      text,
    };
  }

  function focus(idx) {
    if (!last || !Array.isArray(last.issues) || !last.issues[idx]) return;
    const iss = last.issues[idx];
    clearHighlight();
    focused = idx;
    if (bar) {
      for (const btn of bar.querySelectorAll('#geom-check-list [data-gc-idx]')) {
        btn.classList.toggle('active', Number(btn.dataset.gcIdx) === idx);
      }
    }
    const grp = new THREE.Group();
    const box = Viewer.baseBox(iss.itemId);
    const bodyDiag = box ? box.getSize(new THREE.Vector3()).length() : 24;

    if (iss.kind === 'tinyEdge') {
      const node = Viewer.nodes.get(iss.itemId);
      const pos = node ? Viewer.edgePositions(node, iss.edgeIdx) : null;
      if (pos && pos.length >= 6) {
        const line = Viewer.makeFat(pos, 0xe5484d, 6, { depthTest: false, order: 46 });
        line.matrixAutoUpdate = false;
        line.matrix.copy(node.obj.matrix);
        grp.add(line);
      } else if (iss.a && iss.b && Math.hypot(iss.a[0] - iss.b[0], iss.a[1] - iss.b[1], iss.a[2] - iss.b[2]) > 1e-7) {
        grp.add(Viewer.makeFat([...iss.a, ...iss.b], 0xe5484d, 6, { depthTest: false, order: 46 }));
      }
      addMarker(grp, iss.at, clamp(bodyDiag * 0.055, 1.4, 7));
    } else if (iss.kind === 'badFace') {
      if (iss.faceIdx >= 0) {
        const ov = Viewer.faceOverlay(iss.itemId, iss.faceIdx, 0xe5484d, 0.55);
        if (ov) { ov.renderOrder = 44; grp.add(ov); }
      }
      addMarker(grp, iss.at, clamp(bodyDiag * 0.06, 1.8, 8));
    } else if (iss.kind === 'selfIntersect') {
      const seenF = new Set();
      for (const fi of [iss.faceIdx, iss.faceIdx2]) {
        if (fi == null || fi < 0 || seenF.has(fi)) continue;
        seenF.add(fi);
        const ov = Viewer.faceOverlay(iss.itemId, fi, 0xe5484d, 0.48);
        if (ov) { ov.renderOrder = 44; grp.add(ov); }
      }
      addMarker(grp, iss.at, clamp(bodyDiag * 0.06, 1.8, 8));
    }

    Viewer.groups.overlay.add(grp);
    highlightGroup = grp;
    Viewer.requestRender();

    if (Array.isArray(iss.at) && iss.at.length >= 3) {
      const cen = new THREE.Vector3(iss.at[0], iss.at[1], iss.at[2]);
      const cam = Viewer.activeCamera, ctr = Viewer.controls;
      const dir = cam.position.clone().sub(ctr.target);
      if (dir.lengthSq() < 1e-8) dir.set(1, -1, 1);
      dir.normalize();
      const span = iss.kind === 'tinyEdge' ? Math.max(8, bodyDiag * 0.35) : Math.max(12, bodyDiag * 0.55);
      const fov = cam.fov || 45;
      const dist = (span / Math.sin((fov * Math.PI) / 360)) * 1.05;
      Viewer.moveCamera(cen.clone().add(dir.multiplyScalar(dist)), cen);
    }
  }

  async function run(opts = {}) {
    if (!App.doc.items.length) {
      last = { rev: App.revision, issues: [], checkedCount: 0, minEdge: opts.minEdge || 0.01, truncated: false, errors: [] };
      return last;
    }
    const keys = {};
    for (const [id, r] of App.results) if (r && r.key) keys[id] = r.key;
    const rev = App.revision;
    const res = await Kernel.call('checkGeometry', {
      scene: Model.kernelScene(App.doc),
      opts: { minEdge: opts.minEdge || 0.01, keys },
    });
    const issues = (res && res.issues ? res.issues : []).map((iss) => {
      const f = Model.find(App.doc, iss.itemId);
      return { ...iss, itemName: f ? Model.label(f.item) : 'Körper' };
    });
    last = {
      rev,
      issues,
      checkedCount: res ? res.checkedCount || 0 : 0,
      minEdge: res ? res.minEdge || 0.01 : 0.01,
      truncated: !!(res && res.truncated),
      errors: (res && res.errors) || [],
    };
    return last;
  }

  function showStaleHint() {
    if (!bar) return;
    const body = bar.querySelector('#gc-body');
    if (!body || body.querySelector('.gc-stale')) return;
    body.prepend(h('div', { class: 'gc-stale' }, 'Das Modell wurde geändert – klick „Noch mal prüfen“ für den aktuellen Stand.'));
  }

  function renderBar() {
    if (!bar) return;
    const body = bar.querySelector('#gc-body');
    if (!body) return;
    body.innerHTML = '';
    if (busy) {
      body.append(h('div', { class: 'hint-box' }, 'Prüfe Geometrie …'));
      return;
    }
    if (!last) return;
    if (!last.checkedCount) {
      body.append(h('div', { class: 'hint-box', id: 'geom-check-empty' }, 'Es gibt keine sichtbaren Körper zu prüfen.'));
      return;
    }
    if (!last.issues.length) {
      body.append(h('div', { class: 'chk-row ok', id: 'geom-check-ok' },
        h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, '✓'),
        h('div', { class: 'grow' },
          h('b', null, 'Keine Probleme'),
          h('span', null, `${last.checkedCount} ${last.checkedCount === 1 ? 'Körper geprüft' : 'Körper geprüft'} – keine kaputten Flächen, winzigen Kanten oder Selbstschnitte.`))));
      return;
    }
    const nBad = last.issues.filter((x) => x.kind === 'badFace').length;
    const nTiny = last.issues.filter((x) => x.kind === 'tinyEdge').length;
    const nSelf = last.issues.filter((x) => x.kind === 'selfIntersect').length;
    const parts = [];
    if (nBad) parts.push(`${nBad} kaputte ${nBad === 1 ? 'Fläche' : 'Flächen'}`);
    if (nTiny) parts.push(`${nTiny} winzige ${nTiny === 1 ? 'Kante' : 'Kanten'}`);
    if (nSelf) parts.push(`${nSelf} ${nSelf === 1 ? 'Selbstschnitt' : 'Selbstschnitte'}`);
    body.append(h('div', { class: 'gc-summary' }, `${last.issues.length} ${last.issues.length === 1 ? 'Problem' : 'Probleme'} gefunden (${parts.join(', ')}):`));

    const list = h('div', { class: 'chk-list gc-list', id: 'geom-check-list' });
    last.issues.forEach((iss, idx) => {
      const info = formatIssue(iss);
      const cls = 'chk-row sk-chk-item ' + (iss.s === 'warn' ? 'warn' : 'bad') + (focused === idx ? ' active' : '');
      const row = h('button', {
        type: 'button',
        class: cls,
        'data-gc-idx': String(idx),
        'data-gc-kind': iss.kind,
      },
        h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, iss.s === 'warn' ? '!' : '✕'),
        h('div', { class: 'grow' }, h('b', null, info.title), h('span', null, info.text)));
      row.onclick = () => focus(idx);
      list.append(row);
    });
    body.append(list);
    if (last.truncated) body.append(h('div', { class: 'vb-hint' }, 'Weitere winzige Kanten ausgeblendet.'));
    body.append(h('div', { class: 'vb-hint' }, 'Klick auf einen Eintrag, um die Stelle im Modell hervorzuheben.'));
  }

  async function open(opts = {}) {
    if (!App.doc.items.length) {
      UI.toast('Es gibt noch nichts zu prüfen. Bau zuerst etwas.', { icon: 'info' });
      return null;
    }
    const seq = ++runSeq;
    clearHighlight();
    focused = null;
    if (!bar || !bar.isConnected) {
      bar = h('div', { class: 'viewbar geom-check-bar', id: 'geom-check-bar' });
      const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Geometrie prüfen'));
      const acts = h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } });
      const rerun = h('button', { type: 'button', class: 'btn small ghost', id: 'gc-rerun', 'data-tip': 'Erneut prüfen' }, 'Noch mal');
      rerun.onclick = () => open(opts);
      const closeBtn = h('button', { type: 'button', class: 'vb-x', id: 'gc-close', 'aria-label': 'Geometrie-Prüfung schließen', 'data-tip': 'Schließen' });
      closeBtn.innerHTML = icon('close');
      closeBtn.onclick = () => close();
      acts.append(rerun, closeBtn);
      head.append(acts);
      bar.append(head, h('div', { id: 'gc-body', style: { display: 'grid', gap: '6px' } }));
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
      const body = bar.querySelector('#gc-body');
      if (body) { body.innerHTML = ''; body.append(h('div', { class: 'chk-row bad' }, h('span', { class: 'chk-dot' }, '✕'), h('div', { class: 'grow' }, h('b', null, 'Prüfung fehlgeschlagen'), h('span', null, String((err && err.message) || err))))); }
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
  }

  return {
    init, menu, open, run, close, focus, clearHighlight, sync,
    get active() { return !!bar; },
    get last() { return last; },
    get focused() { return focused; },
    get hasHighlight() { return !!(highlightGroup && highlightGroup.children.length); },
  };
})();
