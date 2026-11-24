// ================= Verbindung zum CAD-Kern (Web Worker) =================
const Kernel = (() => {
  let worker = null, seq = 1, ready = false;
  const pending = new Map();
  const sentBlobs = new Set();
  let readyResolve, readyReject;
  const readyPromise = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  readyPromise.catch(() => {}); // Fehler zeigt der Startbildschirm

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
  async function start(onProgress) {
    try {
      const wasmP = fetchWasm(onProgress);
      wasmP.catch(() => {});
      let w;
      try { w = await spawn('direct'); } catch (e1) { console.warn('Kern-Worker direkt nicht gestartet:', e1); w = await spawn('blob'); }
      worker = w;
      sentBlobs.clear();
      worker.onmessage = (ev) => {
        const { id, ok, result, error } = ev.data || {};
        if (id === 0) return; // geladen
        const p = pending.get(id); if (!p) return;
        pending.delete(id);
        ok ? p.resolve(result) : p.reject(new Error(error));
      };
      worker.onerror = (e) => {
        const err = new Error('Der CAD-Kern ist abgestürzt: ' + ((e && e.message) || 'unbekannter Fehler'));
        for (const p of pending.values()) p.reject(err); pending.clear();
        if (!ready) readyReject(err);
      };
      const wasm = await wasmP;
      const info = await call('init', { wasm: wasm.buffer }, [wasm.buffer]);
      ready = true; onProgress && onProgress(1);
      readyResolve(info);
      return info;
    } catch (e) { readyReject(e); throw e; }
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
  function call(cmd, args = {}, transfer = []) {
    if (args && args.scene && args.scene.items) attachBlobs(args.scene);
    if (args && args.p && args.p.blobId && !args.p.bytes && !sentBlobs.has(args.p.blobId) && typeof Store !== 'undefined') {
      const b = Store.getBlobSync(args.p.blobId);
      if (b) { args.p.bytes = b; sentBlobs.add(args.p.blobId); }
    }
    return new Promise((resolve, reject) => {
      const id = seq++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, cmd, args }, transfer);
    });
  }
  return { start, call, get ready() { return ready; }, whenReady: () => readyPromise };
})();

