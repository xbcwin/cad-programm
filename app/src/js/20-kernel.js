// ================= Verbindung zum CAD-Kern (Web Worker) =================
const Kernel = (() => {
  let worker = null, seq = 1, ready = false;
  let state = 'idle', progress = 0, loadError = null, startPromise = null;
  let loadStartMs = null, readyMs = null, loadDurMs = null, initMs = null;
  let lastStats = null;
  const pending = new Map();
  const sentBlobs = new Set();
  const ev = makeEmitter();
  let readyResolve;
  const readyPromise = new Promise((res) => { readyResolve = res; });

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

  async function fetchWasm(onProgress) {
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
  function attachBlobs(scene) {
    if (!scene || !Array.isArray(scene.items) || typeof Store === 'undefined') return;
    const walk = (items) => {
      for (const it of items) {
        if (!it) continue;
        if (it.kind === 'import' && it.p && it.p.blobId && !it.p.bytes && !sentBlobs.has(it.p.blobId)) {
          const b = Store.getBlobSync(it.p.blobId);
          if (b) { it.p.bytes = b; sentBlobs.add(it.p.blobId); }
        }
        if (it.children) walk(it.children);
      }
    };
    walk(scene.items);
  }
  function postCall(cmd, args = {}, transfer = []) {
    if (args && args.scene && args.scene.items) attachBlobs(args.scene);
    if (args && args.p && args.p.blobId && !args.p.bytes && !sentBlobs.has(args.p.blobId) && typeof Store !== 'undefined') {
      const b = Store.getBlobSync(args.p.blobId);
      if (b) { args.p.bytes = b; sentBlobs.add(args.p.blobId); }
    }
    return new Promise((resolve, reject) => {
      const id = seq++;
      pending.set(id, {
        resolve: (result) => {
          if (cmd === 'evaluate' && !(args && args.opts && args.opts.aux) && result && result.stats) {
            lastStats = result.stats;
            ev.emit('stats', lastStats);
          }
          resolve(result);
        },
        reject,
      });
      worker.postMessage({ id, cmd, args }, transfer);
    });
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
    state = 'loading'; progress = 0.02; loadError = null; loadStartMs = performance.now(); lastStats = null;
    onProgress && onProgress(progress);
    ev.emit('state', { state, progress });
    startPromise = (async () => {
      try {
        const wasmP = fetchWasm((p) => {
          progress = p;
          onProgress && onProgress(p);
          ev.emit('state', { state, progress });
        });
        wasmP.catch(() => {});
        let w;
        try { w = await spawn('direct'); } catch (e1) { console.warn('Kern-Worker direkt nicht gestartet:', e1); w = await spawn('blob'); }
        worker = w;
        sentBlobs.clear();
        lastStats = null;
        worker.onmessage = (m) => {
          const { id, ok, result, error } = m.data || {};
          if (id === 0) return; // geladen
          const p = pending.get(id); if (!p) return;
          pending.delete(id);
          ok ? p.resolve(result) : p.reject(new Error(error));
        };
        worker.onerror = (e) => {
          const err = new Error('Der CAD-Kern ist abgestürzt: ' + ((e && e.message) || 'unbekannter Fehler'));
          for (const p of pending.values()) p.reject(err); pending.clear();
          if (!ready) {
            state = 'error'; loadError = err; startPromise = null;
            ev.emit('state', { state, progress, error: err });
            ev.emit('error', err);
          }
        };
        const wasm = await wasmP;
        const info = await postCall('init', { wasm: wasm.buffer }, [wasm.buffer]);
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
  async function call(cmd, args = {}, transfer = []) {
    if (!ready) await ensure();
    return postCall(cmd, args, transfer);
  }
  async function stats() {
    if (!ready) return emptyStats();
    const r = await call('stats');
    lastStats = r;
    return r;
  }
  async function resetStats() {
    lastStats = null;
    if (!ready) return emptyStats();
    const r = await call('resetStats');
    lastStats = r;
    return r;
  }
  async function clearCache() {
    if (!ready) return emptyStats();
    const r = await call('clearCache');
    lastStats = r;
    return r;
  }
  return {
    start, ensure, call, on: ev.on,
    stats, resetStats, clearCache, fingerprint,
    get lastStats() { return lastStats; },
    get ready() { return ready; },
    get state() { return state; },
    get progress() { return progress; },
    get error() { return loadError; },
    get timings() { return { loadStartMs, readyMs, loadDurMs, initMs }; },
    whenReady: () => readyPromise,
  };
})();

