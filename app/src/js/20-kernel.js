// ================= Verbindung zum CAD-Kern (Web Worker Pool) =================
const Kernel = (() => {
  const MAX_WORKERS = 4;
  let seq = 1, ready = false;
  let state = 'idle', progress = 0, loadError = null, startPromise = null;
  let loadStartMs = null, readyMs = null, loadDurMs = null, initMs = null;
  let wasmBytes = null, wasmFetchCount = 0, spawnKind = null;
  let multiWorker = true;
  let lastStats = null;
  let evalStatsSeq = 0;
  let evalGen = 0;
  let primaryRespawn = null;
  const pool = []; // [{ index, worker, ready, initPromise, pending, sentBlobs, terminated, lastKernelStats }]
  const keyOwner = new Map(); // resultKey -> workerIndex
  const itemOwner = new Map(); // itemId -> workerIndex
  const retiredStats = { totalRebuilds: 0, totalHits: 0, buildsByItem: {}, hitsByItem: {} };
  const ev = makeEmitter();
  let readyResolve;
  const readyPromise = new Promise((res) => { readyResolve = res; });

  let totalEvalCalls = 0;
  let parallelEvalCalls = 0;
  const workerJobs = [0, 0, 0, 0];
  let lastEval = { chunks: 0, workersUsed: 0, workerIds: [], perWorker: {}, itemWorkers: {}, parallel: false };

  function detectCores() {
    if (typeof navigator === 'undefined') return null;
    const hc = Number(navigator.hardwareConcurrency);
    return Number.isFinite(hc) && hc >= 1 ? Math.floor(hc) : null;
  }
  function detectMaxWorkers() {
    const cores = detectCores();
    return Math.min(MAX_WORKERS, Math.max(1, cores != null ? cores : 2));
  }

  function canonical(v) {
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? 0 : v) : null;
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        const val = v[k];
        if (val === undefined || typeof val === 'function' || typeof val === 'symbol') continue;
        out[k] = canonical(val);
      }
      return out;
    }
    return v;
  }
  function fingerprint(val) {
    const str = JSON.stringify(canonical(val));
    let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
  }
  function emptyStats() {
    return {
      evals: 0,
      totalRebuilds: 0,
      totalHits: 0,
      buildsByItem: {},
      hitsByItem: {},
      lastEval: { evalId: 0, rebuilt: [], cached: [], meshed: [], fingerprints: {} },
      cacheSize: 0,
      meshCacheSize: 0,
    };
  }
  let lastAggEval = emptyStats().lastEval;

  function addMapCounts(dst, src) {
    if (!src) return;
    for (const [k, val] of Object.entries(src)) dst[k] = (dst[k] || 0) + (Number(val) || 0);
  }
  function retireSlotStats(slot) {
    const st = slot && slot.lastKernelStats;
    if (!st) return;
    retiredStats.totalRebuilds += Number(st.totalRebuilds) || 0;
    retiredStats.totalHits += Number(st.totalHits) || 0;
    addMapCounts(retiredStats.buildsByItem, st.buildsByItem);
    addMapCounts(retiredStats.hitsByItem, st.hitsByItem);
    slot.lastKernelStats = null;
  }
  function activeSlots() {
    return pool.filter((s) => s && s.ready && !s.terminated);
  }
  function aggregateKernelStats(overrideLastEval = null) {
    let totalRebuilds = retiredStats.totalRebuilds;
    let totalHits = retiredStats.totalHits;
    let cacheSize = 0;
    let meshCacheSize = 0;
    const buildsByItem = { ...retiredStats.buildsByItem };
    const hitsByItem = { ...retiredStats.hitsByItem };
    for (const s of activeSlots()) {
      const st = s.lastKernelStats;
      if (!st) continue;
      totalRebuilds += Number(st.totalRebuilds) || 0;
      totalHits += Number(st.totalHits) || 0;
      cacheSize += Number(st.cacheSize) || 0;
      meshCacheSize += Number(st.meshCacheSize) || 0;
      addMapCounts(buildsByItem, st.buildsByItem);
      addMapCounts(hitsByItem, st.hitsByItem);
    }
    const le = overrideLastEval || lastAggEval || emptyStats().lastEval;
    return {
      evals: evalStatsSeq,
      totalRebuilds,
      totalHits,
      buildsByItem,
      hitsByItem,
      lastEval: {
        evalId: le.evalId || 0,
        rebuilt: Array.isArray(le.rebuilt) ? le.rebuilt.slice() : [],
        cached: Array.isArray(le.cached) ? le.cached.slice() : [],
        meshed: Array.isArray(le.meshed) ? le.meshed.slice() : [],
        fingerprints: le.fingerprints ? { ...le.fingerprints } : {},
      },
      cacheSize,
      meshCacheSize,
    };
  }

  async function fetchWasm(onProgress) {
    wasmFetchCount++;
    const resp = await fetch('occ-kernel.wasm');
    if (!resp.ok) throw new Error('Der CAD-Kern konnte nicht geladen werden (Fehler ' + resp.status + ').');
    const total = +resp.headers.get('content-length') || 7200000;
    let bytes;
    if (resp.body && resp.body.getReader) {
      const reader = resp.body.getReader(); const chunks = []; let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress && onProgress(Math.min(0.95, got / total) * 0.8); }
      bytes = new Uint8Array(got); let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
    } else bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser ist zu alt für Tracery. Bitte aktualisiere ihn.');
      const ds = new DecompressionStream('gzip');
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
    }
    onProgress && onProgress(0.85);
    return bytes;
  }
  // Worker starten: direkt als Datei, sonst über einen kleinen Blob, der die Datei importiert
  // (manche Umgebungen erlauben nur eins von beiden). Erst die „geladen“-Meldung zählt als Start.
  function spawn(kind) {
    return new Promise((resolve, reject) => {
      const abs = new URL('kernel/worker.js', location.href).href;
      let w;
      try {
        w = kind === 'direct' ? new Worker(abs, { type: 'module' }) : new Worker(URL.createObjectURL(new Blob([`import ${JSON.stringify(abs)};`], { type: 'text/javascript' })), { type: 'module' });
      } catch (e) { reject(e); return; }
      const t = setTimeout(() => { try { w.terminate(); } catch (_) {} reject(new Error('Der CAD-Kern antwortet nicht.')); }, 45000);
      w.onmessage = (ev) => { if (ev.data && ev.data.id === 0) { clearTimeout(t); resolve(w); } };
      w.onerror = (e) => { clearTimeout(t); try { w.terminate(); } catch (_) {} reject(new Error((e && e.message) || 'Der CAD-Kern startet nicht.')); };
    });
  }
  async function spawnWorker() {
    if (spawnKind) {
      try { return await spawn(spawnKind); }
      catch (e) {
        if (spawnKind === 'direct') { spawnKind = 'blob'; return spawn('blob'); }
        throw e;
      }
    }
    try {
      const w = await spawn('direct');
      spawnKind = 'direct';
      return w;
    } catch (e1) {
      console.warn('Kern-Worker direkt nicht gestartet:', e1);
      const w = await spawn('blob');
      spawnKind = 'blob';
      return w;
    }
  }

  function attachBlobsForSlot(slot, scene) {
    if (!scene || !Array.isArray(scene.items) || typeof Store === 'undefined') return scene;
    const newlySent = [];
    const walk = (items) => {
      let changed = false;
      const out = new Array(items.length);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        out[i] = it;
        if (!it) continue;
        let nextIt = it;
        if (it.kind === 'import' && it.p && it.p.blobId && !it.p.bytes && !slot.sentBlobs.has(it.p.blobId)) {
          const b = Store.getBlobSync(it.p.blobId);
          if (b) {
            nextIt = { ...it, p: { ...it.p, bytes: b } };
            newlySent.push(it.p.blobId);
            changed = true;
          }
        }
        if (Array.isArray(it.children)) {
          const kids = walk(it.children);
          if (kids !== it.children) {
            nextIt = nextIt === it ? { ...it, children: kids } : { ...nextIt, children: kids };
            changed = true;
          }
        }
        out[i] = nextIt;
      }
      return changed ? out : items;
    };
    const nextItems = walk(scene.items);
    for (const bid of newlySent) slot.sentBlobs.add(bid);
    return nextItems !== scene.items ? { ...scene, items: nextItems } : scene;
  }

  function postTo(slot, cmd, args = {}, transfer = []) {
    if (!slot || !slot.worker || slot.terminated) {
      return Promise.reject(new Error('Der CAD-Kern ist nicht aktiv.'));
    }
    let nextArgs = args;
    if (args && args.scene && args.scene.items) {
      const s = attachBlobsForSlot(slot, args.scene);
      if (s !== args.scene) nextArgs = { ...nextArgs, scene: s };
    }
    if (args && args.p && args.p.blobId && !args.p.bytes && !slot.sentBlobs.has(args.p.blobId) && typeof Store !== 'undefined') {
      const b = Store.getBlobSync(args.p.blobId);
      if (b) {
        nextArgs = { ...nextArgs, p: { ...args.p, bytes: b } };
        slot.sentBlobs.add(args.p.blobId);
      }
    }
    return new Promise((resolve, reject) => {
      const id = seq++;
      slot.pending.set(id, { resolve, reject, cmd });
      slot.worker.postMessage({ id, cmd, args: nextArgs }, transfer);
    });
  }

  function clearSlotOwnership(idx) {
    for (const [k, owner] of keyOwner) if (owner === idx) keyOwner.delete(k);
    for (const [id, owner] of itemOwner) if (owner === idx) itemOwner.delete(id);
  }

  function createSlot(index, externalWasmP = null) {
    if (pool[index] && !pool[index].terminated && (pool[index].ready || pool[index].initPromise)) {
      return pool[index].initPromise;
    }
    const slot = { index, worker: null, ready: false, initPromise: null, pending: new Map(), sentBlobs: new Set(), terminated: false, lastKernelStats: null };
    pool[index] = slot;
    slot.initPromise = (async () => {
      try {
        const w = await spawnWorker();
        if (slot.terminated) { try { w.terminate(); } catch (_) {} throw Object.assign(new Error('Rechen-Helfer zurückgesetzt.'), { code: 'worker_reset' }); }
        slot.worker = w;
        w.onmessage = (m) => {
          const { id, ok, result, error } = m.data || {};
          if (id === 0) return; // geladen
          const p = slot.pending.get(id); if (!p) return;
          slot.pending.delete(id);
          ok ? p.resolve(result) : p.reject(new Error(error));
        };
        w.onerror = (e) => {
          if (slot.terminated) return;
          const err = new Error('Der CAD-Kern ist abgestürzt: ' + ((e && e.message) || 'unbekannter Fehler'));
          for (const p of slot.pending.values()) p.reject(err);
          slot.pending.clear();
          if (index === 0) {
            if (!ready) {
              state = 'error'; loadError = err; startPromise = null;
              ev.emit('state', { state, progress, error: err });
              ev.emit('error', err);
            }
          } else {
            retireSlotStats(slot);
            slot.terminated = true;
            slot.ready = false;
            if (pool[index] === slot) pool[index] = null;
            clearSlotOwnership(index);
          }
        };
        if (externalWasmP) wasmBytes = await externalWasmP;
        if (slot.terminated) throw Object.assign(new Error('Rechen-Helfer zurückgesetzt.'), { code: 'worker_reset' });
        // Kopie übertragen, damit wasmBytes im Speicher erhalten bleibt und nie neu aus dem Netz geladen wird
        const copy = wasmBytes.slice();
        const info = await postTo(slot, 'init', { wasm: copy.buffer }, [copy.buffer]);
        if (slot.terminated) throw Object.assign(new Error('Rechen-Helfer zurückgesetzt.'), { code: 'worker_reset' });
        slot.ready = true;
        return info;
      } catch (e) {
        if (pool[index] === slot) pool[index] = null;
        clearSlotOwnership(index);
        throw e;
      }
    })();
    return slot.initPromise;
  }

  function ensure(onProgress) {
    if (ready) {
      onProgress && onProgress(1);
      return readyPromise;
    }
    if (startPromise) {
      if (onProgress) {
        onProgress(progress);
        const off = ev.on('state', (s) => {
          onProgress(s.progress);
          if (s.state === 'ready' || s.state === 'error') off();
        });
      }
      return startPromise;
    }
    state = 'loading'; progress = 0.02; loadError = null; loadStartMs = performance.now();
    lastStats = null; evalStatsSeq = 0; lastAggEval = emptyStats().lastEval;
    retiredStats.totalRebuilds = 0; retiredStats.totalHits = 0; retiredStats.buildsByItem = {}; retiredStats.hitsByItem = {};
    onProgress && onProgress(progress);
    ev.emit('state', { state, progress });
    startPromise = (async () => {
      try {
        const wasmP = wasmBytes
          ? Promise.resolve(wasmBytes)
          : fetchWasm((p) => {
              progress = p;
              onProgress && onProgress(p);
              ev.emit('state', { state, progress });
            });
        wasmP.catch(() => {});
        const info = await createSlot(0, wasmP);
        ready = true; state = 'ready'; progress = 1;
        readyMs = performance.now();
        loadDurMs = Math.max(1, Math.round(readyMs - loadStartMs));
        initMs = info && info.ms != null ? info.ms : null;
        onProgress && onProgress(1);
        ev.emit('state', { state, progress });
        ev.emit('ready', { loadStartMs, readyMs, loadDurMs, initMs });
        readyResolve(info);
        return info;
      } catch (e) {
        state = 'error'; loadError = e; startPromise = null;
        ev.emit('state', { state, progress, error: e });
        ev.emit('error', e);
        throw e;
      }
    })();
    return startPromise;
  }
  const start = ensure;
  const makeCancelError = () => Object.assign(new Error('Rechnen abgebrochen.'), { code: 'cancelled', cancelled: true });

  async function ensurePrimary() {
    if (!ready) await ensure();
    if (pool[0] && pool[0].ready && !pool[0].terminated) return pool[0];
    if (!primaryRespawn) primaryRespawn = createSlot(0).finally(() => { primaryRespawn = null; });
    await primaryRespawn;
    if (!pool[0] || !pool[0].ready || pool[0].terminated) throw new Error('Der CAD-Kern ist nicht aktiv.');
    return pool[0];
  }

  async function ensureWorkers(targetCount) {
    await ensurePrimary();
    const maxW = detectMaxWorkers();
    const limit = Math.min(maxW, Math.max(1, targetCount | 0));
    if (limit <= 1 || !multiWorker || !wasmBytes) return pool[0] ? [pool[0]] : [];
    const jobs = [];
    for (let i = 1; i < limit; i++) {
      const s = pool[i];
      if (s && s.ready && !s.terminated) continue;
      jobs.push(createSlot(i).catch(() => null));
    }
    if (jobs.length) await Promise.allSettled(jobs);
    const active = [];
    for (let i = 0; i < maxW; i++) {
      const s = pool[i];
      if (s && s.ready && !s.terminated) active.push(s);
    }
    return active.length ? active : (pool[0] ? [pool[0]] : []);
  }

  function terminateHelpers() {
    const err = Object.assign(new Error('Rechen-Helfer zurückgesetzt.'), { code: 'worker_reset' });
    for (let i = 1; i < pool.length; i++) {
      const s = pool[i];
      if (!s) continue;
      retireSlotStats(s);
      s.terminated = true;
      s.ready = false;
      for (const p of s.pending.values()) p.reject(err);
      s.pending.clear();
      if (s.worker) { try { s.worker.terminate(); } catch (_) {} }
      pool[i] = null;
    }
    pool.length = pool[0] ? 1 : 0;
    for (const [k, owner] of keyOwner) if (owner >= 1) keyOwner.delete(k);
    for (const [id, owner] of itemOwner) if (owner >= 1) itemOwner.delete(id);
  }

  function setMultiWorker(on) {
    const next = !!on;
    if (next === multiWorker) return multiWorker;
    multiWorker = next;
    if (!multiWorker) terminateHelpers();
    else itemOwner.clear();
    return multiWorker;
  }

  // ---------- Abhängigkeiten & konservative Hüllkästen für die Aufteilung ----------
  const ID_MAT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function matMul4(a, b) {
    const r = new Array(16);
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + rr] * b[c * 4 + k];
      r[c * 4 + rr] = s;
    }
    return r;
  }
  function matTrans4(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
  function matRotAxis4(c, ax, deg) {
    const l = Math.hypot(ax[0], ax[1], ax[2]);
    if (!(l > 1e-9)) return ID_MAT;
    const x = ax[0] / l, y = ax[1] / l, z = ax[2] / l, rad = (deg * Math.PI) / 180;
    const cs = Math.cos(rad), sn = Math.sin(rad), t = 1 - cs;
    const R = [
      cs + x * x * t, x * y * t + z * sn, x * z * t - y * sn, 0,
      x * y * t - z * sn, cs + y * y * t, y * z * t + x * sn, 0,
      x * z * t + y * sn, y * z * t - x * sn, cs + z * z * t, 0,
      0, 0, 0, 1,
    ];
    return matMul4(matTrans4(c[0], c[1], c[2]), matMul4(R, matTrans4(-c[0], -c[1], -c[2])));
  }
  function transformBox(b, m) {
    if (!b || !Array.isArray(m) || m.length < 16) return b || null;
    const xs = [b[0], b[3]], ys = [b[1], b[4]], zs = [b[2], b[5]];
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const x of xs) for (const y of ys) for (const z of zs) {
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (wx < x0) x0 = wx; if (wy < y0) y0 = wy; if (wz < z0) z0 = wz;
      if (wx > x1) x1 = wx; if (wy > y1) y1 = wy; if (wz > z1) z1 = wz;
    }
    return [x0, y0, z0, x1, y1, z1];
  }
  function mergeBox(a, b) {
    if (!a) return b;
    if (!b) return a;
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])];
  }
  function padBox(b, pad) {
    return b ? [b[0] - pad, b[1] - pad, b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad] : null;
  }
  function boxesOverlap(a, b) {
    return a[0] <= b[3] && a[3] >= b[0] && a[1] <= b[4] && a[4] >= b[1] && a[2] <= b[5] && a[5] >= b[2];
  }
  function numOr(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }

  function approxLocalBox(it, depth = 0) {
    if (!it || depth > 16) return null;
    if (Array.isArray(it.finishes) && it.finishes.some((f) => f && (f.type === 'draft' || f.type === 'shell'))) return null;
    const p = it.p || {};
    let box = null;
    switch (it.kind) {
      case 'box': case 'wedge': case 'pyramid': {
        const w = Math.abs(numOr(p.w, 20)), d = Math.abs(numOr(p.d, 20)), h = numOr(p.h, 20);
        box = [-w / 2, -d / 2, Math.min(0, h), w / 2, d / 2, Math.max(0, h)];
        break;
      }
      case 'cylinder': case 'tube': case 'prism': {
        const r = Math.abs(numOr(p.d, 20)) / 2 + Math.abs(numOr(p.tol, 0)) + 0.5, h = numOr(p.h, 20);
        box = [-r, -r, Math.min(0, h), r, r, Math.max(0, h)];
        break;
      }
      case 'cone': {
        const r = Math.max(Math.abs(numOr(p.d1, 20)), Math.abs(numOr(p.d2, 0))) / 2, h = numOr(p.h, 20);
        box = [-r, -r, Math.min(0, h), r, r, Math.max(0, h)];
        break;
      }
      case 'sphere': {
        const r = Math.abs(numOr(p.d, 20)) / 2;
        box = [-r, -r, 0, r, r, 2 * r];
        break;
      }
      case 'hemisphere': {
        const r = Math.abs(numOr(p.d, 20)) / 2;
        box = [-r, -r, 0, r, r, r];
        break;
      }
      case 'torus': {
        const r = Math.abs(numOr(p.d, 30)) / 2 + Math.abs(numOr(p.t, 6)) / 2, t = Math.abs(numOr(p.t, 6));
        box = [-r, -r, -t, r, r, t];
        break;
      }
      case 'helix': {
        const form = p.form === 'cone' || p.form === 'spiral' ? p.form : 'cyl';
        const rMax = form === 'cyl' ? Math.abs(numOr(p.d, 20)) / 2 : Math.max(Math.abs(numOr(p.r1, 10)), Math.abs(numOr(p.r2, 25)));
        const radHalf = p.shape === 'rect' ? Math.abs(numOr(p.profW, 2)) / 2 : Math.abs(numOr(p.wireD, 2)) / 2;
        const axHalf = p.shape === 'rect' ? Math.abs(numOr(p.profH, 2)) / 2 : Math.abs(numOr(p.wireD, 2)) / 2;
        const H = form === 'spiral' ? 0 : (p.by === 'heightTurns' || p.by === 'heightPitch' ? Math.abs(numOr(p.height, 25)) : Math.abs(numOr(p.turns, 5) * numOr(p.pitch, 5)));
        const r = rMax + radHalf + 1;
        box = [-r, -r, -axHalf - 1, r, r, H + 2 * axHalf + 1];
        break;
      }
      case 'part': {
        const lib = String(p.lib || '');
        const tol = Math.abs(numOr(p.tol, 0)) + 1;
        if (lib === 'screwHole') {
          const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
          const dMax = Math.max(numOr(sp.coarse, 12), numOr(sp.hole, 12), numOr(sp.csk, 0), numOr(sp.cbD, 0), 20);
          const L = Math.max(Math.abs(numOr(p.length, 10)), Math.abs(numOr(sp.cbH, 0)));
          const r = dMax / 2 + tol;
          box = [-r, -r, -L - 1, r, r, 1];
        } else if (lib === 'blindHole') {
          const d = Math.abs(numOr(p.d, 5)) + tol, L = Math.abs(numOr(p.depth, 10)), ang = numOr(p.tipAngle, 118);
          const r = d / 2, tipH = ang > 1 && ang < 179.5 ? r / Math.tan((ang * Math.PI) / 360) : 0;
          box = [-r, -r, -(L + tipH) - 1, r, r, 1];
        } else if (lib === 'fitHole') {
          const r = (Math.abs(numOr(p.d, 6)) + tol) / 2, L = Math.abs(numOr(p.depth, 10));
          box = [-r, -r, -L - 1, r, r, 1];
        } else if (lib === 'centerHole') {
          box = [-10, -10, -20, 10, 10, 1];
        } else if (lib === 'nutTrap') {
          const dep = Math.abs(numOr(p.depth, 10)), L = p.withHole !== false ? Math.max(dep, Math.abs(numOr(p.length, dep + 10))) : dep;
          box = [-25, -25, -L - 1, 25, 25, 1];
        } else if (lib === 'insert') {
          const r = 12, L = Math.abs(numOr(p.depth, 15));
          box = [-r, -r, -L - 1, r, r, 1];
        }
        break;
      }
      case 'extrude': {
        if (p.extent === 'toNext' || p.extent === 'toFace' || p.planeRef || !p.plane || !Array.isArray(p.regions)) return null;
        const pl = p.plane;
        if (!Array.isArray(pl.o) || !Array.isArray(pl.x) || !Array.isArray(pl.n)) return null;
        const nx = pl.n, xx = pl.x;
        const nl = Math.hypot(nx[0], nx[1], nx[2]), xl = Math.hypot(xx[0], xx[1], xx[2]);
        if (!(nl > 1e-9) || !(xl > 1e-9)) return null;
        const nv = [nx[0] / nl, nx[1] / nl, nx[2] / nl];
        const xv = [xx[0] / xl, xx[1] / xl, xx[2] / xl];
        const yv = [nv[1] * xv[2] - nv[2] * xv[1], nv[2] * xv[0] - nv[0] * xv[2], nv[0] * xv[1] - nv[1] * xv[0]];
        let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
        const addPt = (pt) => {
          if (!Array.isArray(pt) || pt.length < 2) return false;
          const x = Number(pt[0]), y = Number(pt[1]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
          if (x < u0) u0 = x; if (y < v0) v0 = y;
          if (x > u1) u1 = x; if (y > v1) v1 = y;
          return true;
        };
        const addSegs = (segs) => {
          if (!Array.isArray(segs)) return false;
          for (const s of segs) {
            if (!s) continue;
            if (s.t === 'circle' && Array.isArray(s.c) && Number.isFinite(Number(s.r))) {
              const r = Math.abs(Number(s.r));
              if (!addPt([s.c[0] - r, s.c[1] - r]) || !addPt([s.c[0] + r, s.c[1] + r])) return false;
            } else if (s.t === 'ellipse' && Array.isArray(s.c)) {
              const r = Math.max(Math.abs(numOr(s.rx, 0)), Math.abs(numOr(s.ry, 0)));
              if (!addPt([s.c[0] - r, s.c[1] - r]) || !addPt([s.c[0] + r, s.c[1] + r])) return false;
            } else {
              if (s.a && !addPt(s.a)) return false;
              if (s.b && !addPt(s.b)) return false;
              if (s.m && !addPt(s.m)) return false;
              if (s.c1 && !addPt(s.c1)) return false;
              if (s.c2 && !addPt(s.c2)) return false;
            }
          }
          return true;
        };
        for (const rg of p.regions) {
          if (rg && rg.outer && !addSegs(rg.outer)) return null;
        }
        if (!Number.isFinite(u0)) return null;
        // Sicherheitszuschlag für Bögen / Splines zwischen Stützpunkten
        const span = Math.max(u1 - u0, v1 - v0, 1);
        const pad2 = Math.max(2, span * 0.2);
        u0 -= pad2; v0 -= pad2; u1 += pad2; v1 += pad2;
        const d1 = numOr(p.dist, 10), d2 = p.dir === 'two' ? numOr(p.dist2, d1) : 0;
        const zLo = p.dir === 'sym' ? -d1 / 2 : p.dir === 'two' ? -d2 : Math.min(0, p.dir === 'rev' ? -d1 : 0);
        const zHi = p.dir === 'sym' ? d1 / 2 : p.dir === 'two' ? d1 : Math.max(0, p.dir === 'rev' ? 0 : d1);
        const o = pl.o;
        for (const u of [u0, u1]) for (const v of [v0, v1]) for (const w of [zLo, zHi]) {
          const px = o[0] + u * xv[0] + v * yv[0] + w * nv[0];
          const py = o[1] + u * xv[1] + v * yv[1] + w * nv[1];
          const pz = o[2] + u * xv[2] + v * yv[2] + w * nv[2];
          box = mergeBox(box, [px, py, pz, px, py, pz]);
        }
        break;
      }
      case 'loft': {
        if (p.path || p.sections3 || !Array.isArray(p.profiles) || !p.profiles.length) return null;
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        const add3 = (pt) => {
          if (!Array.isArray(pt) || pt.length < 3) return;
          const px = Number(pt[0]), py = Number(pt[1]), pz = Number(pt[2]);
          if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return;
          if (px < x0) x0 = px; if (py < y0) y0 = py; if (pz < z0) z0 = pz;
          if (px > x1) x1 = px; if (py > y1) y1 = py; if (pz > z1) z1 = pz;
        };
        for (const pr of p.profiles) {
          const pl = pr && pr.plane;
          if (!pl || !Array.isArray(pl.o) || !Array.isArray(pl.x) || !Array.isArray(pl.n) || !Array.isArray(pr.poly)) return null;
          const nl = Math.hypot(pl.n[0], pl.n[1], pl.n[2]), xl = Math.hypot(pl.x[0], pl.x[1], pl.x[2]);
          if (!(nl > 1e-9) || !(xl > 1e-9)) return null;
          const nv = [pl.n[0] / nl, pl.n[1] / nl, pl.n[2] / nl];
          const xv = [pl.x[0] / xl, pl.x[1] / xl, pl.x[2] / xl];
          const yv = [nv[1] * xv[2] - nv[2] * xv[1], nv[2] * xv[0] - nv[0] * xv[2], nv[0] * xv[1] - nv[1] * xv[0]];
          for (const q of pr.poly) {
            if (!Array.isArray(q) || q.length < 2) return null;
            const u = Number(q[0]), v = Number(q[1]);
            if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
            add3([pl.o[0] + u * xv[0] + v * yv[0], pl.o[1] + u * xv[1] + v * yv[1], pl.o[2] + u * xv[2] + v * yv[2]]);
          }
        }
        if (Array.isArray(p.tipPoint)) add3(p.tipPoint);
        if (!Number.isFinite(x0)) return null;
        const span = Math.max(x1 - x0, y1 - y0, z1 - z0, 1);
        const pad = Math.max(4, span * 0.45);
        box = [x0 - pad, y0 - pad, z0 - pad, x1 + pad, y1 + pad, z1 + pad];
        break;
      }
      case 'group': {
        const kids = (it.children || []).filter((c) => c && !c.hidden);
        if (!kids.length) return [0, 0, 0, 0, 0, 0];
        let base = null;
        for (const c of kids) {
          if (c.kind === 'mirrorStep') return null;
          const cb = approxLocalBox(c, depth + 1);
          if (!cb) return null;
          base = mergeBox(base, transformBox(cb, c.m));
        }
        if (!base) return null;
        if (!p.op) { box = base; break; }
        if (p.op === 'split' || p.op === 'intersect') { box = base; break; }
        if (p.op === 'pattern') {
          if (p.pt === 'rect') {
            const nx = Math.max(1, Math.min(60, Math.round(numOr(p.nx, 1))));
            const ny = Math.max(1, Math.min(60, Math.round(numOr(p.ny, 1))));
            const dx = numOr(p.dx, 10), dy = numOr(p.dy, 10);
            const sx0 = Math.min(0, (nx - 1) * dx), sx1 = Math.max(0, (nx - 1) * dx);
            const sy0 = Math.min(0, (ny - 1) * dy), sy1 = Math.max(0, (ny - 1) * dy);
            box = [base[0] + sx0, base[1] + sy0, base[2], base[3] + sx1, base[4] + sy1, base[5]];
            break;
          }
          if (p.pt === 'circ' && p.axis !== 'pick') {
            const n = Math.max(1, Math.min(120, Math.round(numOr(p.n, 4)))), ang = numOr(p.ang, 360);
            const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : n > 1 ? ang / (n - 1) : 0;
            const ax = p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
            const c = [numOr(p.cx, 0), numOr(p.cy, 0), numOr(p.cz, 0)];
            for (let k = 0; k < n; k++) box = mergeBox(box, transformBox(base, k === 0 ? ID_MAT : matRotAxis4(c, ax, k * step)));
            break;
          }
          if (p.pt === 'mirror' && (p.plane === 'XY' || p.plane === 'XZ' || p.plane === 'YZ')) {
            const off = numOr(p.off, 0);
            let mb;
            if (p.plane === 'XY') mb = [base[0], base[1], 2 * off - base[5], base[3], base[4], 2 * off - base[2]];
            else if (p.plane === 'XZ') mb = [base[0], 2 * off - base[4], base[2], base[3], 2 * off - base[1], base[5]];
            else mb = [2 * off - base[3], base[1], base[2], 2 * off - base[0], base[4], base[5]];
            box = mergeBox(base, mb);
            break;
          }
          return null;
        }
        return null;
      }
      default:
        return null;
    }
    if (!box) return null;
    let extraPad = 2;
    if (Array.isArray(it.finishes)) {
      for (const f of it.finishes) {
        if (!f) continue;
        extraPad = Math.max(extraPad, 2 + Math.abs(numOr(f.r, 0)), 2 + Math.abs(numOr(f.r2, 0)), 2 + Math.abs(numOr(f.d1, 0)), 2 + Math.abs(numOr(f.d2, 0)), 2 + Math.abs(numOr(f.d3, 0)));
      }
    }
    return padBox(box, extraPad);
  }
  function approxWorldBox(it) {
    const lb = approxLocalBox(it);
    return lb ? transformBox(lb, it.m) : null;
  }

  function partitionScene(scene) {
    const items = Array.isArray(scene && scene.items) ? scene.items : [];
    const hiddenStubs = items.filter((it) => it && it.hidden).map((it) => ({ id: it.id, hidden: true }));
    const visible = items.filter((it) => it && !it.hidden);
    if (visible.length <= 1) return { components: visible.length ? [visible] : [], hiddenStubs, visible };

    // „toNext“ kann gegen beliebige Körper in der Szene laufen → nicht aufteilen
    const hasToNext = (x) => {
      if (!x || x.hidden) return false;
      if (x.kind === 'extrude' && x.p && x.p.extent === 'toNext') return true;
      return Array.isArray(x.children) && x.children.some(hasToNext);
    };
    if (visible.some(hasToNext)) return { components: [visible], hiddenStubs, visible };

    const topIndexById = new Map();
    const indexItem = (x, topIdx) => {
      if (!x || x.hidden) return;
      if (x.id) topIndexById.set(x.id, topIdx);
      if (Array.isArray(x.children)) for (const c of x.children) indexItem(c, topIdx);
    };
    for (let i = 0; i < visible.length; i++) indexItem(visible[i], i);

    const parent = Array.from({ length: visible.length }, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => {
      if (a == null || b == null) return;
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };
    const unionRef = (idx, targetId) => {
      if (!targetId) return;
      const ti = topIndexById.get(targetId);
      if (ti != null) union(idx, ti);
    };

    const TARGET_KINDS = new Set(['transform', 'scale', 'deform', 'thicken', 'rib', 'vent', 'fins', 'web', 'wrap', 'emboss', 'deleteBody', 'boss', 'lipGroove']);
    const walkDeps = (x, topIdx, isTop) => {
      if (!x || x.hidden) return;
      const p = x.p || {};
      if (x.op && x.op.target) unionRef(topIdx, x.op.target);
      if (TARGET_KINDS.has(x.kind) && p.target) unionRef(topIdx, p.target);
      if (x.kind === 'deleteBody' && Array.isArray(p.targets)) for (const tid of p.targets) unionRef(topIdx, tid);
      if (x.kind === 'lipGroove') {
        if (p.lipTarget) unionRef(topIdx, p.lipTarget);
        if (p.grooveTarget) unionRef(topIdx, p.grooveTarget);
      }
      if (x.kind === 'sweep' && p.wrapId) unionRef(topIdx, p.wrapId);
      if (x.kind === 'extrude' && p.extent === 'toFace' && p.toFace && p.toFace.id) unionRef(topIdx, p.toFace.id);
      if (x.kind === 'revolve' && p.dir === 'toFace' && p.toFace && p.toFace.targetId) unionRef(topIdx, p.toFace.targetId);
      if (p.planeRef && p.planeRef.kind === 'face' && p.planeRef.id) unionRef(topIdx, p.planeRef.id);
      if (isTop && x.kind === 'mirrorStep') {
        if (p.faceRef && p.faceRef.id) unionRef(topIdx, p.faceRef.id);
        const fids = Array.isArray(p.features) ? p.features : [];
        for (const fid of fids) {
          const ti = fid ? topIndexById.get(fid) : null;
          if (ti == null || visible[ti].role === 'hole') {
            for (let k = 0; k < topIdx; k++) union(topIdx, k);
            break;
          }
          union(topIdx, ti);
        }
      }
      if (Array.isArray(x.children)) for (const c of x.children) walkDeps(c, topIdx, false);
    };
    for (let i = 0; i < visible.length; i++) walkDeps(visible[i], i, true);

    // Löcher auf oberster Ebene schneiden nur Körper mit überlappendem Welt-Hüllkasten
    const holeIdxs = [], solidIdxs = [];
    for (let i = 0; i < visible.length; i++) {
      if (visible[i].role === 'hole') holeIdxs.push(i);
      else solidIdxs.push(i);
    }
    if (holeIdxs.length && solidIdxs.length) {
      const itemBoxes = visible.map((it) => {
        if (TARGET_KINDS.has(it.kind) || it.kind === 'mirrorStep' || (it.op && (it.op.type === 'join' || it.op.type === 'common'))) return null;
        return approxWorldBox(it);
      });
      const compBox = new Map();
      for (const si of solidIdxs) {
        const r = find(si);
        if (compBox.get(r) === null) continue;
        const b = itemBoxes[si];
        if (!b) compBox.set(r, null);
        else compBox.set(r, mergeBox(compBox.get(r) || null, b));
      }
      for (const hi of holeIdxs) {
        const hb = itemBoxes[hi];
        const hr = find(hi);
        const seenRoots = new Set();
        for (const si of solidIdxs) {
          const sr = find(si);
          if (sr === hr || seenRoots.has(sr)) continue;
          seenRoots.add(sr);
          const sb = compBox.get(sr);
          if (!hb || !sb || boxesOverlap(hb, sb)) union(hi, si);
        }
      }
    }

    const byRoot = new Map();
    for (let i = 0; i < visible.length; i++) {
      const r = find(i);
      let arr = byRoot.get(r);
      if (!arr) { arr = []; byRoot.set(r, arr); }
      arr.push(visible[i]);
    }
    return { components: [...byRoot.values()], hiddenStubs, visible };
  }

  function recordEvalOwnership(nodes, workerIdx) {
    for (const n of nodes || []) {
      if (!n || !n.id) continue;
      itemOwner.set(n.id, workerIdx);
      if (n.key) keyOwner.set(n.key, workerIdx);
    }
  }

  async function evaluateSingleOnSlot(slot, scene, known, totalVisibleCount, opts) {
    const subKnown = {};
    for (const [id, kk] of Object.entries(known || {})) {
      if (kk && keyOwner.get(kk) === slot.index) subKnown[id] = kk;
    }
    const res = await postTo(slot, 'evaluate', { scene, known: subKnown, opts });
    recordEvalOwnership(res && res.nodes, slot.index);
    workerJobs[slot.index] = (workerJobs[slot.index] || 0) + 1;
    totalEvalCalls++;
    const itemWorkers = {};
    for (const n of (res && res.nodes) || []) if (n && n.id) itemWorkers[n.id] = slot.index;
    lastEval = {
      chunks: totalVisibleCount ? 1 : 0,
      workersUsed: 1,
      workerIds: [slot.index],
      perWorker: { [slot.index]: 1 },
      itemWorkers,
      parallel: false,
    };
    if (res && res.stats) {
      slot.lastKernelStats = res.stats;
      evalStatsSeq++;
      const rle = res.stats.lastEval || {};
      lastAggEval = {
        evalId: evalStatsSeq,
        rebuilt: Array.isArray(rle.rebuilt) ? rle.rebuilt.slice() : [],
        cached: Array.isArray(rle.cached) ? rle.cached.slice() : [],
        meshed: Array.isArray(rle.meshed) ? rle.meshed.slice() : [],
        fingerprints: rle.fingerprints ? { ...rle.fingerprints } : {},
      };
      const agg = aggregateKernelStats();
      lastStats = agg;
      ev.emit('stats', agg);
      return { ...res, stats: agg };
    }
    return res;
  }

  async function evaluateParallel(args = {}) {
    const myGen = evalGen;
    await ensurePrimary();
    if (myGen !== evalGen) throw makeCancelError();
    const scene = args.scene || { items: [] };
    const known = args.known || {};
    const opts = args.opts;
    if (opts && opts.aux) {
      return postTo(pool[0], 'evaluate', { scene, known, opts });
    }
    const { components, hiddenStubs, visible } = partitionScene(scene);

    if (!multiWorker || args.parallel === false || detectMaxWorkers() <= 1 || components.length < 2) {
      let targetSlot = pool[0];
      if (multiWorker && components.length === 1 && visible.length) {
        const own = itemOwner.get(visible[0].id);
        if (own != null && pool[own] && pool[own].ready && !pool[own].terminated) targetSlot = pool[own];
      }
      return evaluateSingleOnSlot(targetSlot, scene, known, visible.length, opts);
    }

    const target = Math.min(detectMaxWorkers(), components.length);
    const slots = await ensureWorkers(target);
    if (myGen !== evalGen) throw makeCancelError();
    if (slots.length <= 1) {
      return evaluateSingleOnSlot(pool[0], scene, known, visible.length, opts);
    }

    // Komponenten gleichmäßig auf verfügbare Helfer verteilen; bestehende Zuständigkeit (für Cache) bevorzugen,
    // aber nicht alles auf einen einzelnen Helfer klumpen lassen.
    const slotSet = new Map(slots.map((s) => [s.index, s]));
    const buckets = new Map(slots.map((s) => [s.index, []]));
    const sticky = components.map((comp) => {
      const own = itemOwner.get(comp[0].id);
      return own != null && slotSet.has(own) ? own : null;
    });
    const nonNullSticky = sticky.filter((x) => x != null);
    const allSameSticky = nonNullSticky.length === components.length && new Set(nonNullSticky).size === 1;

    const unassigned = [];
    for (let ci = 0; ci < components.length; ci++) {
      const st = allSameSticky ? null : sticky[ci];
      if (st != null && buckets.get(st).length < Math.ceil(components.length / slots.length)) {
        buckets.get(st).push({ ci, comp: components[ci] });
      } else {
        unassigned.push({ ci, comp: components[ci] });
      }
    }
    for (const entry of unassigned) {
      let bestIdx = slots[0].index, bestLen = Infinity;
      for (const s of slots) {
        const len = buckets.get(s.index).length;
        if (len < bestLen) { bestLen = len; bestIdx = s.index; }
      }
      buckets.get(bestIdx).push(entry);
    }

    const compResults = new Array(components.length);
    const perWorker = {};
    const itemWorkers = {};

    const runSlotBucket = async (slot, list) => {
      for (const { ci, comp } of list) {
        const subScene = { items: [...hiddenStubs, ...comp] };
        if (scene.quality) subScene.quality = scene.quality;
        const subKnown = {};
        for (const it of comp) {
          const kk = known[it.id];
          if (kk && keyOwner.get(kk) === slot.index) subKnown[it.id] = kk;
        }
        let usedIdx = slot.index;
        let res;
        try {
          res = await postTo(slot, 'evaluate', { scene: subScene, known: subKnown, opts });
        } catch (err) {
          if (err && (err.cancelled || err.code === 'cancelled')) throw err;
          if (slot.index !== 0 && pool[0] && pool[0].ready && !pool[0].terminated) {
            usedIdx = 0;
            const fallbackKnown = {};
            for (const it of comp) {
              const kk = known[it.id];
              if (kk && keyOwner.get(kk) === 0) fallbackKnown[it.id] = kk;
            }
            res = await postTo(pool[0], 'evaluate', { scene: subScene, known: fallbackKnown, opts });
          } else {
            throw err;
          }
        }
        if (res && res.stats && pool[usedIdx]) pool[usedIdx].lastKernelStats = res.stats;
        recordEvalOwnership(res && res.nodes, usedIdx);
        workerJobs[usedIdx] = (workerJobs[usedIdx] || 0) + 1;
        perWorker[usedIdx] = (perWorker[usedIdx] || 0) + 1;
        for (const n of (res && res.nodes) || []) if (n && n.id) itemWorkers[n.id] = usedIdx;
        compResults[ci] = res;
      }
    };

    await Promise.all(
      slots
        .filter((s) => buckets.get(s.index).length > 0)
        .map((s) => runSlotBucket(s, buckets.get(s.index)))
    );

    const nodeById = new Map();
    const errors = [];
    const times = {};
    const resolved = {};
    const rebuilt = [];
    const cached = [];
    const meshed = [];
    const fingerprints = {};
    let hasKernelStats = false;
    for (const cr of compResults) {
      if (!cr) continue;
      for (const n of cr.nodes || []) if (n && n.id) nodeById.set(n.id, n);
      if (Array.isArray(cr.errors)) errors.push(...cr.errors);
      if (cr.times) Object.assign(times, cr.times);
      if (cr.resolved) Object.assign(resolved, cr.resolved);
      if (cr.stats) {
        hasKernelStats = true;
        const le = cr.stats.lastEval || {};
        if (Array.isArray(le.rebuilt)) rebuilt.push(...le.rebuilt);
        if (Array.isArray(le.cached)) cached.push(...le.cached);
        if (Array.isArray(le.meshed)) meshed.push(...le.meshed);
        if (le.fingerprints) Object.assign(fingerprints, le.fingerprints);
      }
    }
    const nodes = [];
    for (const it of visible) {
      const n = nodeById.get(it.id);
      if (n) nodes.push(n);
    }

    const workerIds = Object.keys(perWorker).map(Number).sort((a, b) => a - b);
    totalEvalCalls++;
    if (workerIds.length > 1) parallelEvalCalls++;
    lastEval = {
      chunks: components.length,
      workersUsed: workerIds.length,
      workerIds,
      perWorker,
      itemWorkers,
      parallel: workerIds.length > 1,
    };
    const out = { nodes, errors, times, resolved };
    if (hasKernelStats) {
      evalStatsSeq++;
      lastAggEval = { evalId: evalStatsSeq, rebuilt, cached, meshed, fingerprints };
      const aggStats = aggregateKernelStats();
      lastStats = aggStats;
      ev.emit('stats', aggStats);
      out.stats = aggStats;
    }
    return out;
  }

  const KEY_ROUTED = new Set(['remesh', 'faceLoops', 'faceGrid', 'section', 'silhouette']);
  async function call(cmd, args = {}, transfer = []) {
    await ensurePrimary();
    if (cmd === 'evaluate') return evaluateParallel(args);
    let slot = pool[0];
    if (KEY_ROUTED.has(cmd) && args && args.key) {
      const idx = keyOwner.get(args.key);
      if (idx != null && pool[idx] && pool[idx].ready && !pool[idx].terminated) slot = pool[idx];
    } else if (cmd === 'faceIntersect' && args && args.a && args.b && args.a.key && args.b.key) {
      const iA = keyOwner.get(args.a.key);
      const iB = keyOwner.get(args.b.key);
      if (iA != null && iA === iB && pool[iA] && pool[iA].ready && !pool[iA].terminated) slot = pool[iA];
    }
    return postTo(slot, cmd, args, transfer);
  }
  function cancel() {
    evalGen++;
    let killedPrimary = false;
    const err = makeCancelError();
    for (let i = 0; i < pool.length; i++) {
      const slot = pool[i];
      if (!slot || slot.terminated) continue;
      let hasEval = false;
      for (const p of slot.pending.values()) {
        if (p && p.cmd === 'evaluate') { hasEval = true; break; }
      }
      if (!hasEval) continue;
      retireSlotStats(slot);
      slot.terminated = true;
      slot.ready = false;
      for (const p of slot.pending.values()) p.reject(err);
      slot.pending.clear();
      if (slot.worker) { try { slot.worker.terminate(); } catch (_) {} }
      pool[i] = null;
      clearSlotOwnership(i);
      if (i === 0) killedPrimary = true;
    }
    if (killedPrimary && wasmBytes && !primaryRespawn) {
      primaryRespawn = createSlot(0).catch(() => null).finally(() => { primaryRespawn = null; });
    }
    return true;
  }
  function resetPoolStats() {
    totalEvalCalls = 0;
    parallelEvalCalls = 0;
    workerJobs.fill(0);
    lastEval = { chunks: 0, workersUsed: 0, workerIds: [], perWorker: {}, itemWorkers: {}, parallel: false };
  }

  async function stats() {
    if (!ready) return emptyStats();
    const slots = activeSlots();
    await Promise.all(slots.map(async (s) => {
      try { s.lastKernelStats = await postTo(s, 'stats'); } catch (_) {}
    }));
    const r = aggregateKernelStats();
    lastStats = r;
    return r;
  }
  async function resetStats() {
    resetPoolStats();
    lastStats = null;
    evalStatsSeq = 0;
    lastAggEval = emptyStats().lastEval;
    retiredStats.totalRebuilds = 0;
    retiredStats.totalHits = 0;
    retiredStats.buildsByItem = {};
    retiredStats.hitsByItem = {};
    if (!ready) return emptyStats();
    const slots = activeSlots();
    await Promise.all(slots.map(async (s) => {
      try { s.lastKernelStats = await postTo(s, 'resetStats'); } catch (_) {}
    }));
    const r = aggregateKernelStats();
    lastStats = r;
    return r;
  }
  async function clearCache() {
    keyOwner.clear();
    itemOwner.clear();
    if (!ready) return emptyStats();
    const slots = activeSlots();
    await Promise.all(slots.map(async (s) => {
      try { s.lastKernelStats = await postTo(s, 'clearCache'); } catch (_) {}
    }));
    const r = aggregateKernelStats();
    lastStats = r;
    return r;
  }

  return {
    start, ensure, call, cancel, on: ev.on,
    stats, resetStats, resetPoolStats, clearCache, fingerprint,
    setMultiWorker, partitionScene,
    get lastStats() { return lastStats; },
    get multiWorker() { return multiWorker; },
    get maxWorkers() { return detectMaxWorkers(); },
    get workerCount() { return pool.filter((s) => s && s.ready && !s.terminated).length; },
    get poolStats() {
      return {
        multiWorker,
        maxWorkers: detectMaxWorkers(),
        cores: detectCores(),
        activeWorkers: pool.filter((s) => s && s.ready && !s.terminated).length,
        wasmFetches: wasmFetchCount,
        totalEvalCalls,
        parallelEvalCalls,
        workerJobs: workerJobs.slice(),
        lastEval: {
          chunks: lastEval.chunks,
          workersUsed: lastEval.workersUsed,
          workerIds: lastEval.workerIds.slice(),
          perWorker: { ...lastEval.perWorker },
          itemWorkers: { ...lastEval.itemWorkers },
          parallel: lastEval.parallel,
        },
      };
    },
    get ready() { return ready; },
    get state() { return state; },
    get progress() { return progress; },
    get error() { return loadError; },
    get timings() { return { loadStartMs, readyMs, loadDurMs, initMs }; },
    whenReady: () => readyPromise,
  };
})();

