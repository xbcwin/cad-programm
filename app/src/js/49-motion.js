// ================= Bewegungs-Studie: Motoren, Zeitachse & Punkt-Kurven (BG-21) =================
const Motion = (() => {
  const TRACE_COLORS = ['#e03131', '#1971c2', '#2f9e44', '#e8590c', '#7048e8', '#0c8599'];
  const DEFAULT_STUDY = () => ({ duration: 4, fps: 30, loop: false, motors: [], traces: [] });

  let panelEl = null;
  let panelOpen = false;
  let curTime = 0;
  let anim = null;
  let traceGroup = null;
  let lastTraces = {};
  let pickState = null;

  function isProAllowed() {
    return !ViewPrefs.simple;
  }

  function getStudy(doc = App.doc) {
    const m = doc && doc.motion && typeof doc.motion === 'object' ? doc.motion : null;
    if (!m) return DEFAULT_STUDY();
    const dur = Number(m.duration);
    const fps = Number(m.fps);
    return {
      duration: Number.isFinite(dur) && dur > 0 ? clamp(dur, 0.1, 3600) : 4,
      fps: Number.isFinite(fps) ? clamp(Math.round(fps), 10, 120) : 30,
      loop: !!m.loop,
      motors: Array.isArray(m.motors) ? m.motors : [],
      traces: Array.isArray(m.traces) ? m.traces : [],
    };
  }

  function ensureMotionObj(doc) {
    if (!doc.motion || typeof doc.motion !== 'object' || Array.isArray(doc.motion)) {
      doc.motion = DEFAULT_STUDY();
    } else {
      const s = getStudy(doc);
      doc.motion.duration = s.duration;
      doc.motion.fps = s.fps;
      doc.motion.loop = s.loop;
      if (!Array.isArray(doc.motion.motors)) doc.motion.motors = [];
      if (!Array.isArray(doc.motion.traces)) doc.motion.traces = [];
    }
    return doc.motion;
  }

  function movableJoints(doc = App.doc) {
    return typeof Assembly !== 'undefined' && Assembly.movableJoints
      ? Assembly.movableJoints(doc)
      : [];
  }

  function findJoint(jid, doc = App.doc) {
    return movableJoints(doc).find((j) => j.id === jid) || null;
  }

  function jointKind(j) {
    return (j && j.kind) || 'rot';
  }

  function dofsOfJoint(j) {
    const k = jointKind(j);
    if (k === 'cyl' || k === 'slot') return ['ang', 'pos'];
    if (k === 'planar') return ['u', 'v', 'ang'];
    if (k === 'ball') return ['rx', 'ry', 'ang'];
    return ['ang'];
  }

  function defaultDof(j) {
    return jointKind(j) === 'slot' ? 'pos' : 'ang';
  }

  function dofIsLinear(j, dof) {
    const k = jointKind(j);
    if (k === 'slide') return true;
    if ((k === 'cyl' || k === 'slot') && dof === 'pos') return true;
    if (k === 'planar' && (dof === 'u' || dof === 'v')) return true;
    return false;
  }

  function dofUnit(j, dof) {
    return dofIsLinear(j, dof) ? Units.label() : '°';
  }

  function dofSpeedUnit(j, dof) {
    return dofIsLinear(j, dof) ? `${Units.label()}/s` : '°/s';
  }

  function dofLabel(j, dof) {
    const k = jointKind(j);
    if (k === 'slide') return T('motion.dofSlide');
    if (dof === 'pos') return T('motion.dofPos');
    if (dof === 'u') return 'U';
    if (dof === 'v') return 'V';
    if (dof === 'rx') return 'RX';
    if (dof === 'ry') return 'RY';
    return T('motion.dofRot');
  }

  function jointLabel(j, doc = App.doc) {
    if (!j) return 'Gelenk';
    if (j.name) return j.name;
    const a = Model.find(doc, j.a);
    const b = Model.find(doc, j.b);
    const na = a ? Model.label(a.item) : '?';
    const nb = b ? Model.label(b.item) : '?';
    return `${na} → ${nb}`;
  }

  function evalMotor(m, t) {
    if (!m) return 0;
    const tt = Math.max(0, Number(t) || 0);
    if (m.mode === 'profile') {
      const keys = Array.isArray(m.keys)
        ? m.keys
          .filter((k) => k && Number.isFinite(Number(k.t)) && Number.isFinite(Number(k.v)))
          .map((k) => ({ t: Math.max(0, Number(k.t)), v: Number(k.v) }))
          .sort((a, b) => a.t - b.t)
        : [];
      if (!keys.length) return Number.isFinite(Number(m.startVal)) ? Number(m.startVal) : 0;
      if (tt <= keys[0].t) return keys[0].v;
      if (tt >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
      for (let i = 1; i < keys.length; i++) {
        const k0 = keys[i - 1], k1 = keys[i];
        if (tt <= k1.t) {
          const span = k1.t - k0.t;
          if (span <= 1e-9) return k1.v;
          let u = clamp((tt - k0.t) / span, 0, 1);
          if (m.interp === 'smooth') u = u * u * (3 - 2 * u);
          return k0.v + (k1.v - k0.v) * u;
        }
      }
      return keys[keys.length - 1].v;
    }
    const t0 = Math.max(0, Number(m.tStart) || 0);
    const t1 = (m.tEnd != null && Number.isFinite(Number(m.tEnd))) ? Math.max(t0, Number(m.tEnd)) : Infinity;
    const dt = clamp(tt, t0, t1) - t0;
    const base = Number.isFinite(Number(m.startVal)) ? Number(m.startVal) : 0;
    const spd = Number.isFinite(Number(m.speed)) ? Number(m.speed) : 0;
    return base + spd * dt;
  }

  function evalStatesAt(doc, t) {
    const study = getStudy(doc);
    const out = {};
    for (const m of study.motors) {
      if (!m || m.enabled === false) continue;
      const j = findJoint(m.jointId, doc);
      if (!j) continue;
      const dofs = dofsOfJoint(j);
      const dof = dofs.includes(m.dof) ? m.dof : defaultDof(j);
      out[j.id] = out[j.id] || {};
      out[j.id][dof] = round(evalMotor(m, t), 4);
    }
    return out;
  }

  function updateTraceMarkers3D() {
    if (!traceGroup || !panelOpen || !isProAllowed()) return;
    const study = getStudy(App.doc);
    const byId = new Map(study.traces.map((tr) => [tr.id, tr]));
    traceGroup.traverse((o) => {
      if (!o.userData || !o.userData.traceMarkerId) return;
      const tr = byId.get(o.userData.traceMarkerId);
      if (!tr || !Model.find(App.doc, tr.itemId)) return;
      const W = Model.worldMatrix(App.doc, tr.itemId);
      const wp = new THREE.Vector3(
        Number(tr.localPt && tr.localPt[0]) || 0,
        Number(tr.localPt && tr.localPt[1]) || 0,
        Number(tr.localPt && tr.localPt[2]) || 0
      ).applyMatrix4(W);
      o.position.copy(wp);
    });
  }

  function clearTraces3D() {
    if (!traceGroup) return;
    Viewer.groups.overlay.remove(traceGroup);
    traceGroup.traverse((o) => {
      if (o.isLineSegments2 || (o.material && o.material.isLineMaterial)) Viewer.disposeFat(o);
      else {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
    traceGroup = null;
    Viewer.requestRender();
  }

  function computeAllTraces(doc = App.doc) {
    const study = getStudy(doc);
    const visibleTraces = study.traces.filter((tr) => tr && tr.visible !== false && Model.find(doc, tr.itemId));
    if (!visibleTraces.length) return {};

    const dur = study.duration;
    const steps = clamp(Math.round(dur * 24), 24, 120);
    const simDoc = deepClone(doc);
    const hasMotors = study.motors.some((m) => m && m.enabled !== false && findJoint(m.jointId, simDoc));

    const out = {};
    for (const tr of visibleTraces) {
      out[tr.id] = {
        id: tr.id,
        itemId: tr.itemId,
        name: tr.name || 'Punkt',
        color: tr.color || TRACE_COLORS[0],
        points: [],
        totalLength: 0,
        maxDist: 0,
      };
    }

    for (let i = 0; i <= steps; i++) {
      const t = round((dur * i) / steps, 4);
      if (hasMotors) {
        const sm = evalStatesAt(simDoc, t);
        if (Object.keys(sm).length) {
          Joints.applyStates(simDoc, sm, { live: false, expandRange: true });
        }
      }
      for (const tr of visibleTraces) {
        const W = Model.worldMatrix(simDoc, tr.itemId);
        const lp = tr.localPt || [0, 0, 0];
        const wp = new THREE.Vector3(Number(lp[0]) || 0, Number(lp[1]) || 0, Number(lp[2]) || 0).applyMatrix4(W);
        const p = [round(wp.x, 4), round(wp.y, 4), round(wp.z, 4)];
        const entry = out[tr.id];
        let s = 0;
        let dist = 0;
        if (entry.points.length) {
          const prev = entry.points[entry.points.length - 1];
          const p0 = entry.points[0].p;
          s = prev.s + Math.hypot(p[0] - prev.p[0], p[1] - prev.p[1], p[2] - prev.p[2]);
          dist = Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]);
        }
        entry.points.push({ t, p, s: round(s, 3), dist: round(dist, 3) });
        entry.totalLength = round(s, 3);
        if (dist > entry.maxDist) entry.maxDist = round(dist, 3);
      }
    }
    return out;
  }

  function refreshTraces(opts = {}) {
    lastTraces = computeAllTraces(App.doc);
    renderTraces3D();
    if (opts.renderPanel !== false && panelOpen) {
      const chartHost = panelEl && panelEl.querySelector('#mot-chart-host');
      if (chartHost) {
        chartHost.innerHTML = '';
        chartHost.append(buildChartBlock(lastTraces, getStudy().duration));
      }
      const trList = panelEl && panelEl.querySelector('#motion-traces');
      if (trList) {
        for (const tr of getStudy().traces) {
          const row = trList.querySelector(`.mot-trace-row[data-trace-id="${tr.id}"] .mot-trace-len`);
          const data = lastTraces[tr.id];
          if (row) row.textContent = data ? Units.fmtLenU(data.totalLength, 1) : '—';
        }
      }
    }
    return lastTraces;
  }

  function renderTraces3D() {
    clearTraces3D();
    if (!panelOpen || !isProAllowed() || App.mode !== 'model' || (typeof Sketch !== 'undefined' && Sketch.active)) return;
    const entries = Object.values(lastTraces);
    if (!entries.length) return;
    const grp = new THREE.Group();
    for (const tr of entries) {
      if (!tr.points || tr.points.length < 2) continue;
      const segs = [];
      for (let i = 1; i < tr.points.length; i++) {
        const a = tr.points[i - 1].p;
        const b = tr.points[i].p;
        segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      if (segs.length >= 6) {
        grp.add(Viewer.makeFat(segs, tr.color, 2.8, { depthTest: false, opacity: 0.92, order: 42 }));
      }
      const p0 = tr.points[0].p;
      const startDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 12, 10),
        new THREE.MeshBasicMaterial({ color: tr.color, depthTest: false, transparent: true, opacity: 0.75 })
      );
      startDot.position.set(p0[0], p0[1], p0[2]);
      startDot.renderOrder = 43;
      grp.add(startDot);

      const curDot = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 16, 12),
        new THREE.MeshBasicMaterial({ color: tr.color, depthTest: false })
      );
      curDot.userData.traceMarkerId = tr.id;
      curDot.renderOrder = 45;
      grp.add(curDot);
    }
    traceGroup = grp;
    Viewer.groups.overlay.add(traceGroup);
    updateTraceMarkers3D();
    Viewer.requestRender();
  }

  function traceValAt(entry, t) {
    const pts = entry && entry.points;
    if (!pts || !pts.length) return 0;
    if (t <= pts[0].t) return pts[0].s;
    if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].s;
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i].t) {
        const p0 = pts[i - 1], p1 = pts[i];
        const span = p1.t - p0.t;
        const u = span > 1e-9 ? clamp((t - p0.t) / span, 0, 1) : 1;
        return p0.s + (p1.s - p0.s) * u;
      }
    }
    return pts[pts.length - 1].s;
  }

  function updateChartCursor() {
    if (!panelEl) return;
    const svg = panelEl.querySelector('#motion-chart');
    if (!svg) return;
    const dur = getStudy().duration;
    const x0 = 36, x1 = 348, y0 = 12, y1 = 88;
    const cx = x0 + (clamp(curTime, 0, dur) / Math.max(1e-6, dur)) * (x1 - x0);
    const curLine = svg.querySelector('.mot-cursor');
    if (curLine) {
      curLine.setAttribute('x1', cx.toFixed(1));
      curLine.setAttribute('x2', cx.toFixed(1));
    }
    const maxS = Number(svg.dataset.maxS) || 1;
    for (const dot of svg.querySelectorAll('.mot-dot[data-trace-id]')) {
      const tr = lastTraces[dot.dataset.traceId];
      if (!tr) continue;
      const s = traceValAt(tr, curTime);
      const cy = y1 - (s / maxS) * (y1 - y0);
      dot.setAttribute('cx', cx.toFixed(1));
      dot.setAttribute('cy', cy.toFixed(1));
    }
  }

  function syncTimeUI() {
    if (!panelEl) return;
    const dur = getStudy().duration;
    const sl = panelEl.querySelector('#mot-slider');
    if (sl) {
      sl.max = String(dur);
      sl.value = String(curTime);
    }
    const ti = panelEl.querySelector('#mot-time-inp');
    if (ti && document.activeElement !== ti) ti.value = String(round(curTime, 2));
    const lbl = panelEl.querySelector('#mot-time-lbl');
    if (lbl) lbl.textContent = `${fmtFixed(curTime, 2)} / ${fmtFixed(dur, 2)} s`;

    for (const card of panelEl.querySelectorAll('.mot-card[data-motor-id]')) {
      const mid = card.dataset.motorId;
      const m = getStudy().motors.find((x) => x.id === mid);
      const j = m && findJoint(m.jointId);
      const outEl = card.querySelector('.mot-cur-val');
      if (outEl && m && j) {
        const val = evalMotor(m, curTime);
        outEl.textContent = dofIsLinear(j, m.dof) ? Units.fmtLenU(val, 1) : fmtAngleU(val);
      }
    }
    updateChartCursor();
  }

  function setTime(t, opts = {}) {
    if (!App.doc) return curTime;
    const dur = getStudy().duration;
    curTime = round(clamp(Number(t) || 0, 0, dur), 4);
    const stateMap = evalStatesAt(App.doc, curTime);
    if (Object.keys(stateMap).length) {
      Joints.applyStates(App.doc, stateMap, { live: true, expandRange: true });
    }
    updateTraceMarkers3D();
    syncTimeUI();
    Viewer.requestRender();
    if (opts.refreshRight && typeof Panels !== 'undefined' && Panels.renderRight) {
      Panels.renderRight({ preserveFocus: true });
    }
    return curTime;
  }

  function updatePlayBtn() {
    const btn = panelEl && panelEl.querySelector('#mot-play');
    if (!btn) return;
    btn.innerHTML = anim ? (icon('stop') + esc(T('motion.pauseBtn'))) : (icon('play') + esc(T('motion.playBtn')));
    btn.setAttribute('aria-pressed', anim ? 'true' : 'false');
  }

  function stop() {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    clearTimeout(anim.timer);
    anim = null;
    updatePlayBtn();
  }

  function play() {
    if (!isProAllowed()) {
      UI.toast(T('motion.proOnly'), { icon: 'info' });
      return false;
    }
    if (typeof Joints !== 'undefined' && Joints.stopPlay) Joints.stopPlay();
    if (anim) return true;
    const study = getStudy();
    if (!study.motors.some((m) => m && m.enabled !== false && findJoint(m.jointId))) {
      UI.toast(T('motion.noActiveMotors'), { icon: 'info' });
      return false;
    }
    if (curTime >= study.duration - 1e-4) setTime(0);
    let lastTs = performance.now();
    anim = { raf: 0, timer: 0 };
    updatePlayBtn();
    const step = () => {
      if (!anim) return;
      cancelAnimationFrame(anim.raf);
      clearTimeout(anim.timer);
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const st = getStudy();
      const nextT = curTime + dt;
      if (nextT >= st.duration) {
        if (st.loop) {
          setTime(nextT % st.duration);
        } else {
          setTime(st.duration);
          stop();
          return;
        }
      } else {
        setTime(nextT);
      }
      if (!anim) return;
      anim.raf = requestAnimationFrame(step);
      anim.timer = setTimeout(step, 40);
    };
    anim.raf = requestAnimationFrame(step);
    anim.timer = setTimeout(step, 40);
    return true;
  }

  function togglePlay() {
    if (anim) { stop(); return false; }
    return play();
  }

  function resetTime() {
    stop();
    return setTime(0, { refreshRight: true });
  }

  function setDuration(sec) {
    const val = Number(sec);
    if (!Number.isFinite(val) || val <= 0) return false;
    const dur = round(clamp(val, 0.1, 3600), 3);
    App.change(T('motion.durUndo'), (doc) => {
      ensureMotionObj(doc).duration = dur;
    });
    if (curTime > dur) setTime(dur);
    refreshTraces();
    render();
    return true;
  }

  function setLoop(on) {
    const next = !!on;
    App.change(T('motion.loopUndo'), (doc) => {
      ensureMotionObj(doc).loop = next;
    });
    render();
    return next;
  }

  function addMotor(jointId, opts = {}) {
    const j = findJoint(jointId);
    if (!j) {
      UI.toast(T('motion.needJoint'), { icon: 'info' });
      return null;
    }
    const dofs = dofsOfJoint(j);
    const dof = opts.dof && dofs.includes(opts.dof) ? opts.dof : defaultDof(j);
    const isLin = dofIsLinear(j, dof);
    const stNow = typeof Joints !== 'undefined' && Joints.stateOf ? Joints.stateOf(j) : { ang: 0 };
    const curVal = round(Number(stNow[dof]) || 0, 4);
    const dur = getStudy().duration;
    const mode = opts.mode === 'profile' ? 'profile' : 'speed';
    const motor = {
      id: uid('mot'),
      jointId: j.id,
      dof,
      mode,
      speed: Number.isFinite(Number(opts.speed)) ? Number(opts.speed) : (isLin ? 10 : 60),
      startVal: Number.isFinite(Number(opts.startVal)) ? Number(opts.startVal) : curVal,
      tStart: Number.isFinite(Number(opts.tStart)) ? Math.max(0, Number(opts.tStart)) : 0,
      tEnd: opts.tEnd != null && Number.isFinite(Number(opts.tEnd)) ? Math.max(0, Number(opts.tEnd)) : null,
      interp: opts.interp === 'smooth' ? 'smooth' : 'linear',
      keys: Array.isArray(opts.keys) && opts.keys.length
        ? opts.keys.map((k) => ({ t: Math.max(0, Number(k.t) || 0), v: Number(k.v) || 0 })).sort((a, b) => a.t - b.t)
        : [
          { t: 0, v: curVal },
          { t: round(dur / 2, 2), v: round(curVal + (isLin ? 20 : 90), 2) },
          { t: dur, v: curVal },
        ],
      enabled: opts.enabled !== false,
    };
    App.change(T('motion.motorAddUndo'), (doc) => {
      ensureMotionObj(doc).motors.push(motor);
    });
    setTime(curTime);
    refreshTraces();
    render();
    return motor;
  }

  function updateMotor(id, patch) {
    if (!id || !patch) return false;
    const ok = App.change(T('motion.motorEditUndo'), (doc) => {
      const list = ensureMotionObj(doc).motors;
      const m = list.find((x) => x.id === id);
      if (!m) return false;
      Object.assign(m, patch);
      if (Array.isArray(m.keys)) {
        m.keys = m.keys
          .filter((k) => k && Number.isFinite(Number(k.t)) && Number.isFinite(Number(k.v)))
          .map((k) => ({ t: Math.max(0, Number(k.t)), v: Number(k.v) }))
          .sort((a, b) => a.t - b.t);
      }
      return true;
    }) !== false;
    if (ok) {
      setTime(curTime);
      refreshTraces();
      render();
    }
    return ok;
  }

  function removeMotor(id) {
    const ok = App.change(T('motion.motorDelUndo'), (doc) => {
      const m = ensureMotionObj(doc);
      const before = m.motors.length;
      m.motors = m.motors.filter((x) => x.id !== id);
      return m.motors.length !== before;
    }) !== false;
    if (ok) {
      refreshTraces();
      render();
    }
    return ok;
  }

  function defaultLocalPointFor(itemId) {
    const f = Model.find(App.doc, itemId);
    if (!f) return [0, 0, 0];
    const V = Model.vars(App.doc).v;
    let b = Model.itemLocalBox(f.item, V);
    if (!b) {
      const n = Viewer.nodes.get(itemId);
      const bb = n && n.mesh && n.mesh.geometry && n.mesh.geometry.boundingBox;
      if (bb) b = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z];
    }
    if (!b) return [0, 0, 0];
    const j = movableJoints().find((x) => x.b === itemId || x.a === itemId);
    if (j && Array.isArray(j.ao)) {
      const invW = Model.worldMatrix(App.doc, itemId).invert();
      const piv = new THREE.Vector3(j.ao[0] || 0, j.ao[1] || 0, j.ao[2] || 0).applyMatrix4(invW);
      let best = [b[3], b[4], b[5]];
      let bestD = -1;
      for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
        const d = (x - piv.x) ** 2 + (y - piv.y) ** 2 + (z - piv.z) ** 2;
        if (d > bestD) { bestD = d; best = [x, y, z]; }
      }
      return best.map((v) => round(v, 3));
    }
    return [round((b[0] + b[3]) / 2, 3), round((b[1] + b[4]) / 2, 3), round((b[2] + b[5]) / 2, 3)];
  }

  function addTrace(itemId, localPt, opts = {}) {
    const f = Model.find(App.doc, itemId);
    if (!f) return null;
    const pt = Array.isArray(localPt) && localPt.length >= 3
      ? [round(Number(localPt[0]) || 0, 4), round(Number(localPt[1]) || 0, 4), round(Number(localPt[2]) || 0, 4)]
      : defaultLocalPointFor(itemId);
    const study = getStudy();
    const color = opts.color || TRACE_COLORS[study.traces.length % TRACE_COLORS.length];
    const name = (opts.name && String(opts.name).trim()) || `${Model.label(f.item)} (${study.traces.length + 1})`;
    const trace = { id: uid('tr'), itemId, name, localPt: pt, color, visible: opts.visible !== false };
    App.change(T('motion.traceAddUndo'), (doc) => {
      ensureMotionObj(doc).traces.push(trace);
    });
    refreshTraces();
    render();
    return trace;
  }

  function updateTrace(id, patch) {
    const ok = App.change(T('motion.traceEditUndo'), (doc) => {
      const tr = ensureMotionObj(doc).traces.find((x) => x.id === id);
      if (!tr) return false;
      Object.assign(tr, patch);
      return true;
    }) !== false;
    if (ok) {
      refreshTraces();
      render();
    }
    return ok;
  }

  function removeTrace(id) {
    const ok = App.change(T('motion.traceDelUndo'), (doc) => {
      const m = ensureMotionObj(doc);
      const before = m.traces.length;
      m.traces = m.traces.filter((x) => x.id !== id);
      return m.traces.length !== before;
    }) !== false;
    if (ok) {
      refreshTraces();
      render();
    }
    return ok;
  }

  function stopTracePick() {
    if (!pickState) return;
    const vp = $('#viewport');
    if (vp) {
      vp.removeEventListener('pointerdown', pickState.onDown, true);
      vp.style.cursor = '';
    }
    document.removeEventListener('keydown', pickState.onKey, true);
    pickState = null;
    UI.hint(null);
    const btn = panelEl && panelEl.querySelector('#mot-trace-pick');
    if (btn) btn.classList.remove('primary');
  }

  function startTracePick() {
    if (pickState) { stopTracePick(); return; }
    const vp = $('#viewport');
    if (!vp) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopTracePick(); }
    };
    const onDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true });
      if (!hit || !hit.id) {
        UI.toast(T('motion.pickMiss'), { icon: 'info' });
        return;
      }
      const top = Model.topOf(App.doc, hit.id);
      if (!top) return;
      const inv = Model.worldMatrix(App.doc, top.id).invert();
      const lp = hit.point.clone().applyMatrix4(inv);
      stopTracePick();
      addTrace(top.id, [lp.x, lp.y, lp.z]);
    };
    pickState = { onDown, onKey };
    vp.addEventListener('pointerdown', onDown, true);
    vp.style.cursor = 'crosshair';
    document.addEventListener('keydown', onKey, true);
    UI.hint(T('motion.pickHint'));
    const btn = panelEl && panelEl.querySelector('#mot-trace-pick');
    if (btn) btn.classList.add('primary');
  }

  function buildChartBlock(tracesMap, dur) {
    const entries = Object.values(tracesMap).filter((tr) => tr.points && tr.points.length >= 2);
    if (!entries.length) {
      return h('div', { class: 'hint-box', id: 'motion-chart-empty' }, T('motion.chartEmpty'));
    }
    const W = 360, H = 110, x0 = 36, x1 = 348, y0 = 12, y1 = 88;
    const maxS = Math.max(1, ...entries.map((tr) => tr.totalLength || 0));
    const svgNS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
      const el = document.createElementNS(svgNS, tag);
      for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
      return el;
    };
    const svg = mk('svg', {
      id: 'motion-chart',
      class: 'mot-chart-svg',
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': T('motion.chartTitle'),
    });
    svg.dataset.maxS = String(maxS);

    for (let i = 0; i <= 4; i++) {
      const gx = x0 + ((x1 - x0) * i) / 4;
      const gy = y0 + ((y1 - y0) * i) / 4;
      svg.append(mk('line', { x1: gx, y1: y0, x2: gx, y2: y1, class: 'cam-grid' }));
      svg.append(mk('line', { x1: x0, y1: gy, x2: x1, y2: gy, class: 'cam-grid' }));
      const tx = mk('text', { x: gx, y: y1 + 13, 'text-anchor': 'middle', class: 'cam-axis-lbl' });
      tx.textContent = `${fmtFixed((dur * i) / 4, 1)}s`;
      svg.append(tx);
    }
    svg.append(mk('line', { x1: x0, y1: y1, x2: x1, y2: y1, class: 'cam-axis' }));
    svg.append(mk('line', { x1: x0, y1: y0, x2: x0, y2: y1, class: 'cam-axis' }));
    const lblTop = mk('text', { x: x0 - 4, y: y0 + 6, 'text-anchor': 'end', class: 'cam-axis-lbl' });
    lblTop.textContent = Units.fmtLen(maxS, 0);
    const lblBot = mk('text', { x: x0 - 4, y: y1, 'text-anchor': 'end', class: 'cam-axis-lbl' });
    lblBot.textContent = '0';
    svg.append(lblTop, lblBot);

    const xOf = (t) => x0 + (clamp(t, 0, dur) / Math.max(1e-6, dur)) * (x1 - x0);
    const yOf = (s) => y1 - (s / maxS) * (y1 - y0);

    for (const tr of entries) {
      const d = tr.points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(pt.t).toFixed(1)},${yOf(pt.s).toFixed(1)}`).join(' ');
      svg.append(mk('path', { d, class: 'mot-curve', stroke: tr.color, 'data-trace-id': tr.id }));
    }
    const cx = xOf(curTime);
    svg.append(mk('line', { x1: cx.toFixed(1), y1: y0, x2: cx.toFixed(1), y2: y1, class: 'mot-cursor' }));
    for (const tr of entries) {
      const cy = yOf(traceValAt(tr, curTime));
      svg.append(mk('circle', {
        cx: cx.toFixed(1), cy: cy.toFixed(1), r: '3.5',
        class: 'mot-dot', fill: tr.color, 'data-trace-id': tr.id,
      }));
    }

    const scrub = (ev) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const sx = ((ev.clientX - rect.left) / rect.width) * W;
      const u = clamp((sx - x0) / (x1 - x0), 0, 1);
      stop();
      setTime(u * dur);
    };
    svg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      scrub(e);
      const onMove = (ev) => scrub(ev);
      const onUp = () => {
        svg.removeEventListener('pointermove', onMove);
        svg.removeEventListener('pointerup', onUp);
        svg.removeEventListener('pointercancel', onUp);
      };
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerup', onUp);
      svg.addEventListener('pointercancel', onUp);
    });
    return h('div', { class: 'mot-chart-wrap' },
      h('div', { class: 'cam-chart-head' }, h('span', null, T('motion.chartTitle')), h('span', { class: 'sub' }, T('motion.chartSub', { unit: Units.label() }))),
      svg
    );
  }

  function renderMotorCard(m, dur) {
    const j = findJoint(m.jointId);
    const card = h('div', { class: 'mot-card', dataset: { motorId: m.id } });
    const head = h('div', { class: 'mot-card-head' });
    const enChk = h('input', { type: 'checkbox', class: 'mot-enabled', checked: m.enabled !== false, 'aria-label': T('motion.enableMotor') });
    enChk.onchange = () => updateMotor(m.id, { enabled: enChk.checked });
    const title = h('span', { class: 'mot-card-title' }, j ? `${jointLabel(j)} · ${dofLabel(j, m.dof)}` : T('motion.missingJoint'));
    const curVal = h('span', { class: 'mot-cur-val mono' }, j ? (dofIsLinear(j, m.dof) ? Units.fmtLenU(evalMotor(m, curTime), 1) : fmtAngleU(evalMotor(m, curTime))) : '—');
    const delBtn = h('button', { type: 'button', class: 'j-del mot-del', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') });
    delBtn.innerHTML = icon('trash');
    delBtn.onclick = () => removeMotor(m.id);
    head.append(enChk, title, curVal, delBtn);
    card.append(head);

    if (!j) return card;

    const isLin = dofIsLinear(j, m.dof);
    const unitStr = dofUnit(j, m.dof);
    const modeRow = h('div', { class: 'fields' });
    modeRow.append(UI.selectField({
      label: T('motion.modeLabel'),
      value: m.mode || 'speed',
      options: [['speed', T('motion.modeSpeed')], ['profile', T('motion.modeProfile')]],
      cls: 'mot-mode-sel',
      onChange: (v) => updateMotor(m.id, { mode: v }),
    }));
    if (m.mode === 'profile') {
      modeRow.append(UI.selectField({
        label: T('motion.interpLabel'),
        value: m.interp || 'linear',
        options: [['linear', T('motion.interpLinear')], ['smooth', T('motion.interpSmooth')]],
        cls: 'mot-interp-sel',
        onChange: (v) => updateMotor(m.id, { interp: v }),
      }));
    } else {
      modeRow.append(UI.numField({
        label: T('motion.speedLabel', { unit: dofSpeedUnit(j, m.dof) }),
        value: m.speed,
        unit: dofSpeedUnit(j, m.dof),
        expr: false,
        onCommit: (v) => updateMotor(m.id, { speed: v }),
      }));
    }
    card.append(modeRow);

    if (m.mode === 'profile') {
      const keys = Array.isArray(m.keys) ? m.keys : [];
      const kWrap = h('div', { class: 'mot-keys' });
      keys.forEach((k, idx) => {
        const kr = h('div', { class: 'mot-key-row', dataset: { keyIdx: String(idx) } });
        const tInp = h('input', { type: 'text', class: 'mot-key-t mono', value: String(k.t), 'aria-label': 't (s)' });
        tInp.onchange = () => {
          const nv = parseNum(tInp.value);
          if (!Number.isFinite(nv)) { tInp.value = String(k.t); return; }
          const next = keys.map((x, i) => (i === idx ? { ...x, t: Math.max(0, nv) } : x));
          updateMotor(m.id, { keys: next });
        };
        const vInp = h('input', { type: 'text', class: 'mot-key-v mono', value: String(k.v), 'aria-label': unitStr });
        vInp.onchange = () => {
          const nv = parseNum(vInp.value);
          if (!Number.isFinite(nv)) { vInp.value = String(k.v); return; }
          const next = keys.map((x, i) => (i === idx ? { ...x, v: nv } : x));
          updateMotor(m.id, { keys: next });
        };
        const kd = h('button', { type: 'button', class: 'j-del mot-key-del', 'aria-label': T('common.delete'), disabled: keys.length <= 1 });
        kd.innerHTML = icon('close');
        kd.onclick = () => updateMotor(m.id, { keys: keys.filter((_, i) => i !== idx) });
        kr.append(h('span', { class: 'sub' }, 't:'), tInp, h('span', { class: 'sub' }, 's →'), vInp, h('span', { class: 'sub' }, unitStr), kd);
        kWrap.append(kr);
      });
      const addK = h('button', { type: 'button', class: 'btn small mot-key-add' });
      addK.innerHTML = icon('plus') + esc(T('motion.addKeyBtn'));
      addK.onclick = () => {
        const lastK = keys[keys.length - 1] || { t: 0, v: 0 };
        const nextT = round(Math.min(dur, lastK.t + 0.5), 2);
        updateMotor(m.id, { keys: [...keys, { t: nextT, v: lastK.v }] });
      };
      card.append(kWrap, addK);
    } else {
      const subRow = h('div', { class: 'fields three' });
      subRow.append(
        UI.numField({
          label: T('motion.startValLabel'),
          value: m.startVal ?? 0,
          unit: isLin ? 'mm' : '°',
          len: isLin,
          expr: false,
          onCommit: (v) => updateMotor(m.id, { startVal: v }),
        }),
        UI.numField({
          label: T('motion.tStartLabel'),
          value: m.tStart ?? 0,
          unit: 's',
          min: 0,
          expr: false,
          onCommit: (v) => updateMotor(m.id, { tStart: Math.max(0, v) }),
        }),
        UI.numField({
          label: T('motion.tEndLabel'),
          value: m.tEnd != null ? m.tEnd : dur,
          unit: 's',
          min: 0,
          expr: false,
          onCommit: (v) => updateMotor(m.id, { tEnd: Math.max(0, v) }),
        })
      );
      card.append(subRow);
    }
    return card;
  }

  function render() {
    if (!panelOpen || !isProAllowed()) return;
    if (!panelEl || !panelEl.isConnected) {
      panelEl = h('div', {
        id: 'motion-panel',
        class: 'motion-panel pro',
        role: 'region',
        'aria-label': T('motion.title'),
        'data-help': 'motionStudy',
      });
      const ov = $('#overlay');
      if (ov) ov.append(panelEl);
    }
    panelEl.innerHTML = '';

    const study = getStudy();
    const mjs = movableJoints();
    const dur = study.duration;
    if (curTime > dur) curTime = dur;

    // 1. Kopfzeile
    const closeBtn = h('button', { type: 'button', class: 'vb-x', id: 'motion-close', 'aria-label': T('common.close'), 'data-tip': T('common.close') });
    closeBtn.innerHTML = icon('close');
    closeBtn.onclick = () => close();
    const head = h('div', { class: 'mot-head' },
      h('div', { class: 'mot-title-wrap' },
        h('span', { class: 'mot-title-ic', innerHTML: icon('play') }),
        h('b', { class: 'mot-title' }, T('motion.title')),
        h('span', { class: 'sub mono' }, T('motion.summary', { m: study.motors.length, t: study.traces.length }))),
      closeBtn
    );
    panelEl.append(head);

    // 2. Zeitachse
    const tl = h('div', { class: 'mot-tl', id: 'motion-timeline' });
    const resetBtn = h('button', { type: 'button', class: 'btn small', id: 'mot-reset', 'data-tip': T('motion.resetTip') });
    resetBtn.innerHTML = icon('undo') + esc(T('motion.resetBtn'));
    resetBtn.onclick = () => resetTime();

    const playBtn = h('button', { type: 'button', class: 'btn small primary', id: 'mot-play' });
    playBtn.onclick = () => togglePlay();

    const loopLbl = h('label', { class: 'check mot-loop-chk' },
      h('input', { type: 'checkbox', id: 'mot-loop', checked: !!study.loop }),
      T('motion.loopLabel')
    );
    loopLbl.querySelector('input').onchange = (e) => setLoop(e.target.checked);

    const timeInp = h('input', {
      type: 'text', id: 'mot-time-inp', class: 'mot-num-inp mono',
      value: String(round(curTime, 2)), 'aria-label': T('motion.timeLabel'),
    });
    timeInp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') timeInp.blur(); });
    timeInp.addEventListener('change', () => {
      const nv = parseNum(timeInp.value);
      if (Number.isFinite(nv)) { stop(); setTime(nv); }
      else timeInp.value = String(round(curTime, 2));
    });

    const durInp = h('input', {
      type: 'text', id: 'mot-dur-inp', class: 'mot-num-inp mono',
      value: String(round(dur, 2)), 'aria-label': T('motion.durationLabel'),
    });
    durInp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') durInp.blur(); });
    durInp.addEventListener('change', () => {
      const nv = parseNum(durInp.value);
      if (Number.isFinite(nv) && nv > 0) setDuration(nv);
      else durInp.value = String(round(dur, 2));
    });

    const timeLbl = h('span', { id: 'mot-time-lbl', class: 'mot-time-lbl mono' }, `${fmtFixed(curTime, 2)} / ${fmtFixed(dur, 2)} s`);
    const tlTop = h('div', { class: 'mot-tl-row' },
      resetBtn, playBtn, loopLbl,
      h('span', { class: 'mot-tl-spacer' }),
      h('label', { class: 'mot-inline-f' }, h('span', null, T('motion.timeLabel')), timeInp, h('span', { class: 'sub' }, 's')),
      h('label', { class: 'mot-inline-f' }, h('span', null, T('motion.durationLabel')), durInp, h('span', { class: 'sub' }, 's')),
      timeLbl
    );
    const slider = h('input', {
      type: 'range', id: 'mot-slider', class: 'mot-slider',
      min: '0', max: String(dur), step: '0.01', value: String(curTime),
      'aria-label': T('motion.sliderAria'),
    });
    slider.oninput = () => { stop(); setTime(parseFloat(slider.value)); };
    tl.append(tlTop, slider);
    panelEl.append(tl);
    updatePlayBtn();

    // 3. Motoren + Punkt-Kurven
    const grid = h('div', { class: 'mot-grid' });

    // Motoren-Spalte
    const motCol = h('div', { class: 'mot-col' });
    motCol.append(h('div', { class: 'section-h' }, T('motion.motorsHeading')));
    if (!mjs.length) {
      motCol.append(h('div', { class: 'hint-box' }, T('motion.noJointsHint')));
    } else {
      const jSel = h('select', { id: 'mot-add-joint', 'aria-label': T('motion.jointSelectAria') });
      for (const j of mjs) jSel.append(h('option', { value: j.id }, jointLabel(j)));
      const dofSel = h('select', { id: 'mot-add-dof', 'aria-label': T('motion.dofSelectAria') });
      const syncDofOpts = () => {
        const j = findJoint(jSel.value) || mjs[0];
        dofSel.innerHTML = '';
        for (const d of dofsOfJoint(j)) dofSel.append(h('option', { value: d }, dofLabel(j, d)));
        dofSel.value = defaultDof(j);
        dofSel.hidden = dofsOfJoint(j).length <= 1;
      };
      syncDofOpts();
      jSel.onchange = syncDofOpts;

      const modeSel = h('select', { id: 'mot-add-mode', 'aria-label': T('motion.modeLabel') },
        h('option', { value: 'speed' }, T('motion.modeSpeedShort')),
        h('option', { value: 'profile' }, T('motion.modeProfileShort'))
      );
      const spdInp = h('input', { type: 'text', id: 'mot-add-speed', class: 'mot-num-inp mono', value: '60', 'aria-label': T('motion.speedShortAria') });
      modeSel.onchange = () => { spdInp.hidden = modeSel.value === 'profile'; };
      const addMotBtn = h('button', { type: 'button', class: 'btn small primary', id: 'mot-add-btn' });
      addMotBtn.innerHTML = icon('plus') + esc(T('motion.addMotorBtn'));
      addMotBtn.onclick = () => {
        const sp = parseNum(spdInp.value);
        addMotor(jSel.value, {
          dof: dofSel.value,
          mode: modeSel.value,
          speed: Number.isFinite(sp) ? sp : undefined,
        });
      };
      motCol.append(h('div', { class: 'mot-add-row' }, jSel, dofSel, modeSel, spdInp, addMotBtn));
    }
    const motList = h('div', { id: 'motion-motors', class: 'mot-list' });
    if (study.motors.length) {
      for (const m of study.motors) motList.append(renderMotorCard(m, dur));
    } else if (mjs.length) {
      motList.append(h('div', { class: 'hint-box' }, T('motion.motorsEmptyHint')));
    }
    motCol.append(motList);

    // Punkt-Kurven-Spalte
    const trCol = h('div', { class: 'mot-col' });
    trCol.append(h('div', { class: 'section-h' }, T('motion.tracesHeading')));
    const topItems = (App.doc && App.doc.items || []).filter((it) => it && it.role !== 'hole');
    if (topItems.length) {
      const itemSel = h('select', { id: 'mot-trace-item', 'aria-label': T('motion.traceItemAria') });
      for (const it of topItems) itemSel.append(h('option', { value: it.id }, Model.label(it)));
      const addTrBtn = h('button', { type: 'button', class: 'btn small', id: 'mot-trace-add' });
      addTrBtn.innerHTML = icon('plus') + esc(T('motion.addTraceBtn'));
      addTrBtn.onclick = () => addTrace(itemSel.value);
      const pickBtn = h('button', { type: 'button', class: 'btn small' + (pickState ? ' primary' : ''), id: 'mot-trace-pick' });
      pickBtn.innerHTML = icon('target') + esc(T('motion.pickTraceBtn'));
      pickBtn.onclick = () => startTracePick();
      trCol.append(h('div', { class: 'mot-add-row' }, itemSel, addTrBtn, pickBtn));
    }
    const trList = h('div', { id: 'motion-traces', class: 'mot-trace-list' });
    for (const tr of study.traces) {
      const data = lastTraces[tr.id];
      const row = h('div', { class: 'mot-trace-row', dataset: { traceId: tr.id } });
      const visChk = h('input', { type: 'checkbox', class: 'mot-trace-vis', checked: tr.visible !== false, 'aria-label': T('motion.traceVisibleAria') });
      visChk.onchange = () => updateTrace(tr.id, { visible: visChk.checked });
      const sw = h('span', { class: 'swatch', style: { background: tr.color } });
      const nm = h('span', { class: 'nm' }, tr.name || 'Punkt');
      const lenEl = h('span', { class: 'mot-trace-len sub mono' }, data ? Units.fmtLenU(data.totalLength, 1) : '—');
      const delBtn = h('button', { type: 'button', class: 'j-del mot-trace-del', 'aria-label': T('common.delete') });
      delBtn.innerHTML = icon('trash');
      delBtn.onclick = () => removeTrace(tr.id);
      row.append(visChk, sw, nm, lenEl, delBtn);
      trList.append(row);
    }
    const chartHost = h('div', { id: 'mot-chart-host' }, buildChartBlock(lastTraces, dur));
    trCol.append(trList, chartHost);

    grid.append(motCol, trCol);
    panelEl.append(grid);
  }

  function open(opts = {}) {
    if (!isProAllowed()) {
      UI.toast(T('motion.proOnly'), { icon: 'info' });
      return false;
    }
    if (App.mode !== 'model') Commands.setMode('model');
    panelOpen = true;
    refreshTraces({ renderPanel: false });
    render();
    if (opts && opts.jointId && panelEl) {
      const sel = panelEl.querySelector('#mot-add-joint');
      if (sel && [...sel.options].some((o) => o.value === opts.jointId)) {
        sel.value = opts.jointId;
        sel.dispatchEvent(new Event('change'));
      }
    }
    if (typeof Panels !== 'undefined' && Panels.renderTools) Panels.renderTools();
    return true;
  }

  function close() {
    stop();
    stopTracePick();
    panelOpen = false;
    if (panelEl) { panelEl.remove(); panelEl = null; }
    clearTraces3D();
    if (typeof Panels !== 'undefined' && Panels.renderTools) Panels.renderTools();
  }

  function toggle(opts = {}) {
    if (panelOpen) { close(); return false; }
    return open(opts);
  }

  function pruneInvalid(doc) {
    if (!doc || !doc.motion || typeof doc.motion !== 'object') return;
    if (Array.isArray(doc.motion.motors)) {
      const jIds = new Set(movableJoints(doc).map((j) => j.id));
      const next = doc.motion.motors.filter((m) => m && jIds.has(m.jointId));
      if (next.length !== doc.motion.motors.length) doc.motion.motors = next;
    }
    if (Array.isArray(doc.motion.traces)) {
      const nextT = doc.motion.traces.filter((tr) => tr && Model.find(doc, tr.itemId));
      if (nextT.length !== doc.motion.traces.length) doc.motion.traces = nextT;
    }
  }

  function init() {
    App.on('doc', () => {
      pruneInvalid(App.doc);
      if (panelOpen) {
        refreshTraces({ renderPanel: false });
        render();
      }
    });
    App.on('docLoaded', () => {
      stop();
      stopTracePick();
      curTime = 0;
      if (panelOpen) {
        refreshTraces({ renderPanel: false });
        render();
      } else {
        clearTraces3D();
      }
    });
    App.on('mode', () => {
      if (App.mode !== 'model') {
        stop();
        stopTracePick();
        if (panelEl) panelEl.hidden = true;
        clearTraces3D();
      } else if (panelOpen) {
        if (panelEl) panelEl.hidden = false;
        refreshTraces();
      }
    });
    ViewPrefs.on('change', () => {
      if (ViewPrefs.simple && panelOpen) close();
    });
  }

  return {
    init,
    open,
    close,
    toggle,
    render,
    setTime,
    play,
    stop,
    togglePlay,
    resetTime,
    setDuration,
    setLoop,
    addMotor,
    updateMotor,
    removeMotor,
    addTrace,
    updateTrace,
    removeTrace,
    startTracePick,
    stopTracePick,
    evalMotor,
    evalStatesAt,
    computeAllTraces,
    refreshTraces,
    getStudy,
    get active() { return panelOpen; },
    get playing() { return !!anim; },
    get time() { return curTime; },
    get duration() { return getStudy().duration; },
    get loop() { return getStudy().loop; },
    get picking() { return !!pickState; },
    get traces() { return lastTraces; },
  };
})();
