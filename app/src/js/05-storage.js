// ================= Browser-Datenbank (IndexedDB) für große Projekte und binäre Importe =================
const Store = (() => {
  const DB_NAME = 'tracery-db', DB_VER = 1;
  const RECOVERY_KEY = 'recovery';
  const LS_REC_FLAG = 'tracery.recovery.flag';
  const LS_REC_QUICK = 'tracery.recovery.quick';
  const QUICK_MAX_CHARS = 400000;
  let db = null, dbPromise = null, initPromise = null, ready = false, usingIDB = true;
  let index = [], lastId = null, recoveryCache = null;
  let openTabs = { ids: [], activeId: null };
  const blobCache = new Map();     // blobId -> Uint8Array
  const pendingBlobs = new Map();  // blobId -> Promise<void>
  const versionsCache = new Map(); // projectId -> Array
  const projectCache = new Map();  // projectId -> doc
  const fallbackProjects = new Map();
  const ev = makeEmitter();
  let writeQueue = Promise.resolve();

  function walkItems(items, fn) {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      if (!it) continue;
      fn(it);
      if (it.children) walkItems(it.children, fn);
    }
  }
  function countItems(doc) {
    let n = 0;
    walkItems(doc && doc.items, () => { n++; });
    return n;
  }

  // ---------- Binär-/Base64-Helfer ----------
  function toUint8(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return new Uint8Array(0);
  }
  function bytesToBase64(buf) {
    const u8 = toUint8(buf);
    const parts = [];
    for (let i = 0; i < u8.length; i += 0x8000) {
      parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)));
    }
    return btoa(parts.join(''));
  }
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function sameBytes(a, b) {
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    if (a === b) return true;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function hashBytes(u8) {
    let h1 = 0xdeadbeef ^ u8.byteLength, h2 = 0x41c6ce57 ^ u8.byteLength;
    for (let i = 0; i < u8.byteLength; i++) {
      const ch = u8[i];
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const base = 'b_' + (h2 >>> 0).toString(36) + '_' + (h1 >>> 0).toString(36) + '_' + u8.byteLength;
    let id = base, n = 1;
    while (blobCache.has(id) && !sameBytes(blobCache.get(id), u8)) id = base + '_' + (n++);
    return id;
  }

  // ---------- IndexedDB-Zugriff ----------
  function ensureDB() {
    if (db) return Promise.resolve(db);
    if (!usingIDB || typeof indexedDB === 'undefined') { usingIDB = false; return Promise.resolve(null); }
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
        };
        req.onsuccess = () => {
          db = req.result;
          db.onversionchange = () => { try { db.close(); } catch (_) {} db = null; dbPromise = null; };
          resolve(db);
        };
        req.onerror = () => { usingIDB = false; console.warn('IndexedDB nicht verfügbar:', req.error); resolve(null); };
        req.onblocked = () => { usingIDB = false; resolve(null); };
      } catch (e) {
        usingIDB = false;
        console.warn('IndexedDB Fehler:', e);
        resolve(null);
      }
    });
    return dbPromise;
  }
  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaktion abgebrochen'));
    });
  }
  async function txGet(d, store, key) {
    const tx = d.transaction(store, 'readonly');
    return reqP(tx.objectStore(store).get(key));
  }
  async function txGetAll(d, store) {
    const tx = d.transaction(store, 'readonly');
    return reqP(tx.objectStore(store).getAll());
  }
  async function txGetAllKeys(d, store) {
    const tx = d.transaction(store, 'readonly');
    return reqP(tx.objectStore(store).getAllKeys());
  }
  async function txPut(d, store, val) {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(val);
    return txDone(tx);
  }
  function enqueue(fn) {
    const next = writeQueue.then(fn, fn);
    writeQueue = next.catch(() => {});
    return next;
  }

  // ---------- Binär-Speicher für Importe ----------
  function registerBlob(data) {
    const u8 = toUint8(data);
    const id = hashBytes(u8);
    if (!blobCache.has(id)) blobCache.set(id, u8);
    const p = (async () => {
      const d = await ensureDB();
      if (!d) return;
      await txPut(d, 'blobs', { id, bytes: u8, size: u8.byteLength });
    })().catch((e) => console.warn('Blob-Speicher:', e)).finally(() => {
      if (pendingBlobs.get(id) === p) pendingBlobs.delete(id);
    });
    pendingBlobs.set(id, p);
    return id;
  }
  async function putBlob(data) {
    const id = registerBlob(data);
    await (pendingBlobs.get(id) || Promise.resolve());
    return id;
  }
  function getBlobSync(id) { return blobCache.get(id) || null; }
  async function getBlob(id) {
    if (!id) return null;
    if (blobCache.has(id)) return blobCache.get(id);
    if (pendingBlobs.has(id)) await pendingBlobs.get(id).catch(() => {});
    if (blobCache.has(id)) return blobCache.get(id);
    const d = await ensureDB();
    if (!d) return null;
    try {
      const rec = await txGet(d, 'blobs', id);
      if (!rec || !rec.bytes) return null;
      const u8 = toUint8(rec.bytes);
      blobCache.set(id, u8);
      return u8;
    } catch (e) { console.warn('Blob laden:', e); return null; }
  }
  function flushBlobs() { return Promise.all([...pendingBlobs.values()]); }

  // Base64-Importdaten oder Rohbytes im Dokument durch kompakte blobId ersetzen
  function extractBlobs(doc) {
    if (!doc || !Array.isArray(doc.items)) return doc;
    walkItems(doc.items, (it) => {
      if (!it || it.kind !== 'import' || !it.p) return;
      if (it.p.bytes) {
        const u8 = toUint8(it.p.bytes);
        it.p.blobId = registerBlob(u8);
        it.p.size = u8.byteLength;
        delete it.p.bytes;
        delete it.p.data;
      } else if (typeof it.p.data === 'string' && it.p.data.length) {
        try {
          const u8 = base64ToBytes(it.p.data);
          it.p.blobId = registerBlob(u8);
          it.p.size = u8.byteLength;
          delete it.p.data;
        } catch (_) {}
      }
    });
    return doc;
  }
  function collectBlobIds(doc, set = new Set()) {
    if (!doc) return set;
    if (Array.isArray(doc.items)) {
      walkItems(doc.items, (it) => {
        if (it && it.kind === 'import' && it.p && it.p.blobId) set.add(it.p.blobId);
      });
    }
    if (doc.lightCache && typeof doc.lightCache === 'object') {
      for (const bid of Object.values(doc.lightCache)) {
        if (typeof bid === 'string' && bid) set.add(bid);
      }
    }
    return set;
  }
  async function hydrateDoc(doc, seen = new Set()) {
    if (!doc || !Array.isArray(doc.items)) return doc;
    if (doc.id) seen.add(doc.id);
    extractBlobs(doc);
    const missing = [...collectBlobIds(doc)].filter((id) => !blobCache.has(id));
    if (missing.length) await Promise.all(missing.map((id) => getBlob(id)));
    const refIds = new Set();
    walkItems(doc.items, (it) => {
      if (it && it.kind === 'ref' && it.p && it.p.docId && !seen.has(it.p.docId)) refIds.add(it.p.docId);
    });
    for (const refId of refIds) {
      if (seen.has(refId)) continue;
      if (!projectCache.has(refId)) {
        await loadProjectInternal(refId, seen).catch(() => null);
      } else {
        await hydrateDoc(projectCache.get(refId), seen).catch(() => null);
      }
    }
    return doc;
  }
  async function inlineBlobs(doc) {
    if (!doc) return doc;
    extractBlobs(doc);
    const out = deepClone(doc);
    delete out.lightCache;
    const items = [];
    walkItems(out.items, (it) => {
      if (it && it.kind === 'import' && it.p && it.p.blobId) items.push(it);
    });
    for (const it of items) {
      const u8 = await getBlob(it.p.blobId);
      if (u8) {
        it.p.data = bytesToBase64(u8);
        delete it.p.blobId;
      }
    }
    return out;
  }

  // ---------- Migration aus localStorage beim ersten Start ----------
  async function migrateFromLocalStorage() {
    let keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    } catch (_) { return; }
    const projKeys = keys.filter((k) => k && k.startsWith('masswerk.proj.'));
    const verKeys = keys.filter((k) => k && k.startsWith('masswerk.versions.'));
    const hasIdx = storageGet('masswerk.index') != null;
    const rawLast = storageGet('masswerk.last');
    if (!projKeys.length && !verKeys.length && !hasIdx && rawLast == null) return;

    const d = await ensureDB();
    let oldIdx = [];
    try { const parsed = JSON.parse(storageGet('masswerk.index') || '[]'); if (Array.isArray(parsed)) oldIdx = parsed; } catch (_) {}

    const migratedEntries = new Map(index.map((x) => [x.id, x]));
    const storedProjIds = new Set(index.map((x) => x.id));

    for (const k of projKeys) {
      const raw = storageGet(k);
      if (!raw) continue;
      let doc;
      try { doc = JSON.parse(raw); } catch (_) { continue; }
      if (!doc || doc.format !== 'masswerk') continue;
      const id = doc.id || k.slice('masswerk.proj.'.length);
      doc.id = id;
      extractBlobs(doc);
      await flushBlobs();
      if (d) {
        const existing = await txGet(d, 'projects', id);
        if (!existing) await txPut(d, 'projects', doc);
      } else {
        fallbackProjects.set(id, doc);
      }
      storedProjIds.add(id);
      if (!migratedEntries.has(id)) {
        migratedEntries.set(id, { id, name: doc.name || 'Projekt', modified: doc.modified || Date.now(), n: countItems(doc), docType: doc.docType === 'assembly' ? 'assembly' : 'part' });
      }
    }

    for (const k of verKeys) {
      const pid = k.slice('masswerk.versions.'.length);
      const raw = storageGet(k);
      if (!raw) continue;
      let arr;
      try { arr = JSON.parse(raw); } catch (_) { continue; }
      if (!Array.isArray(arr)) continue;
      const valid = arr.filter((v) => v && v.doc && v.doc.format === 'masswerk');
      for (const v of valid) extractBlobs(v.doc);
      await flushBlobs();
      if (d) {
        const existing = await txGet(d, 'versions', pid);
        if (!existing && valid.length) await txPut(d, 'versions', { id: pid, list: valid });
        if (!existing && valid.length) versionsCache.set(pid, valid);
      } else if (valid.length) {
        versionsCache.set(pid, valid);
      }
    }

    for (const entry of oldIdx) {
      if (!entry || !entry.id) continue;
      if (!migratedEntries.has(entry.id) && storedProjIds.has(entry.id)) {
        migratedEntries.set(entry.id, entry);
      }
    }
    index = [...migratedEntries.values()]
      .sort((a, b) => (b.modified || 0) - (a.modified || 0))
      .slice(0, 30);

    if (!lastId && rawLast) {
      const ok = d ? !!(await txGet(d, 'projects', rawLast)) : fallbackProjects.has(rawLast);
      if (ok) lastId = rawLast;
    }

    if (d) {
      const tx = d.transaction('meta', 'readwrite');
      const m = tx.objectStore('meta');
      m.put({ k: 'index', v: index });
      if (lastId) m.put({ k: 'last', v: lastId });
      m.put({ k: 'migrated', v: Date.now() });
      await txDone(tx);
    }

    // Alte Projektdaten erst nach erfolgreichem Übertragen löschen (Einstellungen/Kürzel bleiben unberührt)
    storageDel('masswerk.index');
    storageDel('masswerk.last');
    for (const k of projKeys) storageDel(k);
    for (const k of verKeys) storageDel(k);
  }

  // ---------- Initialisierung ----------
  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const d = await ensureDB();
      if (d) {
        try {
          const [idxRec, lastRec, tabsRec] = await Promise.all([
            txGet(d, 'meta', 'index'),
            txGet(d, 'meta', 'last'),
            txGet(d, 'meta', 'openTabs'),
          ]);
          if (idxRec && Array.isArray(idxRec.v)) index = idxRec.v;
          if (lastRec && typeof lastRec.v === 'string') lastId = lastRec.v;
          if (tabsRec && tabsRec.v && Array.isArray(tabsRec.v.ids)) {
            const cleanIds = [...new Set(tabsRec.v.ids.filter((x) => typeof x === 'string' && x))];
            openTabs = {
              ids: cleanIds.slice(0, 20),
              activeId: typeof tabsRec.v.activeId === 'string' && cleanIds.includes(tabsRec.v.activeId) ? tabsRec.v.activeId : (cleanIds[0] || null),
            };
          }
        } catch (e) { console.warn('Meta lesen:', e); }
      }
      try { await migrateFromLocalStorage(); } catch (e) { console.warn('Migration aus localStorage:', e); }
      ready = true;
    })();
    return initPromise;
  }

  // ---------- Projekte ----------
  function recentProjects() { return index.slice(); }
  function hasProject(id) { return index.some((x) => x.id === id); }
  function getLastId() { return lastId; }
  function getOpenTabs() { return { ids: openTabs.ids.slice(), activeId: openTabs.activeId }; }
  function setOpenTabs(ids, activeId) {
    const clean = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && x))].slice(0, 20);
    const act = typeof activeId === 'string' && clean.includes(activeId) ? activeId : (clean[0] || null);
    openTabs = { ids: clean, activeId: act };
    const snap = { ids: clean.slice(), activeId: act };
    return enqueue(async () => {
      const d = await ensureDB();
      if (!d) return true;
      await txPut(d, 'meta', { k: 'openTabs', v: snap });
      return true;
    }).catch((e) => { console.warn('Offene Tabs speichern:', e); return false; });
  }

  function saveProject(doc, itemCount, opts = {}) {
    if (!doc || !doc.id) return Promise.resolve(false);
    extractBlobs(doc);
    const snap = deepClone(doc);
    const n = itemCount != null ? itemCount : countItems(snap);
    const docType = snap.docType === 'assembly' ? 'assembly' : 'part';
    projectCache.set(snap.id, deepClone(snap));
    index = index.filter((x) => x.id !== snap.id);
    index.unshift({ id: snap.id, name: snap.name, modified: snap.modified, n, docType });
    index = index.slice(0, 30);
    const updateLast = !(opts && opts.keepLast);
    if (updateLast) lastId = snap.id;
    const idxSnap = index.slice();
    const lastSnap = lastId;

    return enqueue(async () => {
      await flushBlobs();
      const d = await ensureDB();
      if (!d) {
        fallbackProjects.set(snap.id, snap);
        const ok = storageSet('masswerk.proj.' + snap.id, JSON.stringify(snap));
        if (ok) ev.emit('saved', { id: snap.id, doc: snap });
        return ok;
      }
      const tx = d.transaction(['projects', 'meta'], 'readwrite');
      tx.objectStore('projects').put(snap);
      const m = tx.objectStore('meta');
      m.put({ k: 'index', v: idxSnap });
      if (updateLast && lastSnap) m.put({ k: 'last', v: lastSnap });
      const ok = await txDone(tx);
      if (ok) ev.emit('saved', { id: snap.id, doc: snap });
      return ok;
    }).catch((e) => { console.warn('Projekt speichern:', e); return false; });
  }

  async function loadProjectInternal(id, seen = new Set()) {
    if (!id || seen.has(id)) return null;
    seen.add(id);
    await init();
    await writeQueue;
    const d = await ensureDB();
    let doc = null;
    if (d) {
      try { doc = await txGet(d, 'projects', id); } catch (e) { console.warn('Projekt laden:', e); }
    } else {
      doc = fallbackProjects.get(id) || null;
    }
    if (!doc) return null;
    projectCache.set(doc.id, deepClone(doc));
    await hydrateDoc(doc, seen);
    await loadVersions(id).catch(() => {});
    return doc;
  }
  async function loadProject(id) {
    return loadProjectInternal(id, new Set());
  }
  function getCachedProject(id) {
    return (id && projectCache.get(id)) || null;
  }
  async function ensureDocsLoaded(ids = []) {
    const out = [];
    for (const id of ids) {
      if (!id) continue;
      if (projectCache.has(id)) { out.push(projectCache.get(id)); continue; }
      const d = await loadProject(id).catch(() => null);
      if (d) out.push(d);
    }
    return out;
  }

  async function gcBlobs(activeDoc = null) {
    const d = await ensureDB();
    if (!d) return;
    const keep = new Set();
    const docs = Array.isArray(activeDoc) ? activeDoc : (activeDoc ? [activeDoc] : []);
    for (const ad of docs) if (ad) collectBlobIds(ad, keep);
    const [projs, vers, recMeta] = await Promise.all([txGetAll(d, 'projects'), txGetAll(d, 'versions'), txGet(d, 'meta', RECOVERY_KEY).catch(() => null)]);
    for (const p of projs) collectBlobIds(p, keep);
    for (const vr of vers) for (const v of (vr && vr.list) || []) if (v && v.doc) collectBlobIds(v.doc, keep);
    if (recMeta && recMeta.v) {
      if (recMeta.v.doc) collectBlobIds(recMeta.v.doc, keep);
      if (recMeta.v.baseDoc) collectBlobIds(recMeta.v.baseDoc, keep);
    }
    const keys = await txGetAllKeys(d, 'blobs');
    const stale = keys.filter((k) => !keep.has(k) && !pendingBlobs.has(k));
    if (stale.length) {
      const tx = d.transaction('blobs', 'readwrite');
      const s = tx.objectStore('blobs');
      for (const k of stale) { s.delete(k); blobCache.delete(k); }
      await txDone(tx);
    }
    for (const k of [...blobCache.keys()]) if (!keep.has(k) && !pendingBlobs.has(k)) blobCache.delete(k);
  }

  function deleteProject(id, activeDoc = null) {
    index = index.filter((x) => x.id !== id);
    if (lastId === id) lastId = index[0] ? index[0].id : null;
    if (openTabs.ids.includes(id)) {
      const nextIds = openTabs.ids.filter((x) => x !== id);
      openTabs = { ids: nextIds, activeId: openTabs.activeId === id ? (nextIds[0] || null) : openTabs.activeId };
    }
    versionsCache.delete(id);
    projectCache.delete(id);
    fallbackProjects.delete(id);
    if (recoveryCache && recoveryCache.docId === id) {
      recoveryCache = null;
      storageDel(LS_REC_FLAG);
      storageDel(LS_REC_QUICK);
    }
    const idxSnap = index.slice();
    const lastSnap = lastId;
    const openTabsSnap = { ids: openTabs.ids.slice(), activeId: openTabs.activeId };

    return enqueue(async () => {
      const d = await ensureDB();
      if (!d) { storageDel('masswerk.proj.' + id); storageDel('masswerk.versions.' + id); return true; }
      const curRec = await txGet(d, 'meta', RECOVERY_KEY).catch(() => null);
      const clearRec = !!(curRec && curRec.v && curRec.v.docId === id);
      const tx = d.transaction(['projects', 'versions', 'meta'], 'readwrite');
      tx.objectStore('projects').delete(id);
      tx.objectStore('versions').delete(id);
      const m = tx.objectStore('meta');
      m.put({ k: 'index', v: idxSnap });
      m.put({ k: 'openTabs', v: openTabsSnap });
      if (lastSnap) m.put({ k: 'last', v: lastSnap }); else m.delete('last');
      if (clearRec) {
        m.delete(RECOVERY_KEY);
        recoveryCache = null;
        storageDel(LS_REC_FLAG);
        storageDel(LS_REC_QUICK);
      }
      await txDone(tx);
      await gcBlobs(activeDoc);
      ev.emit('deleted', { id });
      return true;
    }).catch((e) => { console.warn('Projekt löschen:', e); return false; });
  }

  // ---------- Absturz-Wiederherstellung ----------
  function getRecoveryFlag() {
    const raw = storageGet(LS_REC_FLAG);
    if (!raw) return null;
    try {
      const f = JSON.parse(raw);
      return f && f.active ? f : null;
    } catch (_) { return null; }
  }
  function saveRecovery(doc, opts = {}) {
    if (!doc || !doc.id) return Promise.resolve(false);
    extractBlobs(doc);
    if (opts.baseDoc) extractBlobs(opts.baseDoc);
    const snap = deepClone(doc);
    const baseSnap = opts.baseDoc ? deepClone(opts.baseDoc) : null;
    const n = opts.itemCount != null ? opts.itemCount : countItems(snap);
    const rec = {
      docId: snap.id,
      name: snap.name || 'Neues Projekt',
      savedAt: opts.savedAt || Date.now(),
      itemCount: n,
      doc: snap,
      baseDoc: baseSnap,
    };
    recoveryCache = rec;
    try {
      storageSet(LS_REC_FLAG, JSON.stringify({
        active: true,
        docId: rec.docId,
        name: rec.name,
        savedAt: rec.savedAt,
        itemCount: rec.itemCount,
      }));
      const raw = JSON.stringify(rec);
      if (raw.length <= QUICK_MAX_CHARS) storageSet(LS_REC_QUICK, raw);
      else storageDel(LS_REC_QUICK);
    } catch (_) {
      storageDel(LS_REC_QUICK);
    }
    return enqueue(async () => {
      await flushBlobs();
      const d = await ensureDB();
      if (d) await txPut(d, 'meta', { k: RECOVERY_KEY, v: rec });
      return true;
    }).catch((e) => { console.warn('Absturz-Stand sichern:', e); return false; });
  }
  async function loadRecovery() {
    await init();
    await writeQueue;
    let idbRec = null;
    const d = await ensureDB();
    if (d) {
      try {
        const meta = await txGet(d, 'meta', RECOVERY_KEY);
        if (meta && meta.v && meta.v.doc && meta.v.doc.format === 'masswerk') idbRec = meta.v;
      } catch (e) { console.warn('Absturz-Stand laden:', e); }
    }
    let quickRec = null;
    const flag = getRecoveryFlag();
    if (flag) {
      try {
        const raw = storageGet(LS_REC_QUICK);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.doc && parsed.doc.format === 'masswerk') quickRec = parsed;
        }
      } catch (_) {}
    }
    let chosen = null;
    if (idbRec && quickRec) chosen = (quickRec.savedAt || 0) > (idbRec.savedAt || 0) ? quickRec : idbRec;
    else chosen = idbRec || quickRec || null;
    recoveryCache = chosen;
    return chosen;
  }
  function clearRecovery() {
    recoveryCache = null;
    storageDel(LS_REC_FLAG);
    storageDel(LS_REC_QUICK);
    return enqueue(async () => {
      const d = await ensureDB();
      if (!d) return true;
      const tx = d.transaction('meta', 'readwrite');
      tx.objectStore('meta').delete(RECOVERY_KEY);
      return txDone(tx);
    }).catch((e) => { console.warn('Absturz-Stand löschen:', e); return false; });
  }

  // ---------- Versionen ----------
  async function loadVersions(id) {
    if (!id) return [];
    if (versionsCache.has(id)) return versionsCache.get(id).slice();
    await init();
    const d = await ensureDB();
    let list = [];
    if (d) {
      try {
        const rec = await txGet(d, 'versions', id);
        if (rec && Array.isArray(rec.list)) list = rec.list;
      } catch (e) { console.warn('Versionen laden:', e); }
    }
    for (const v of list) if (v && v.doc) extractBlobs(v.doc);
    versionsCache.set(id, list);
    return list.slice();
  }
  function getVersionsSync(id) {
    return (versionsCache.get(id) || []).slice();
  }
  function setVersions(id, arr) {
    if (!id) return Promise.resolve(false);
    const clean = Array.isArray(arr) ? arr : [];
    for (const v of clean) if (v && v.doc) extractBlobs(v.doc);
    const snap = deepClone(clean);
    versionsCache.set(id, snap);
    return enqueue(async () => {
      await flushBlobs();
      const d = await ensureDB();
      if (!d) return storageSet('masswerk.versions.' + id, JSON.stringify(snap));
      const tx = d.transaction('versions', 'readwrite');
      const s = tx.objectStore('versions');
      if (snap.length) s.put({ id, list: snap });
      else s.delete(id);
      return txDone(tx);
    }).catch((e) => { console.warn('Versionen speichern:', e); return false; });
  }

  function whenIdle() { return Promise.all([flushBlobs(), writeQueue]); }

  // ---------- Sicherheit beim Einlesen fremder Dateien (PL-16) ----------
  const LIMITS = Object.freeze({
    cad: 100 * 1024 * 1024,            // 100 MB (STEP, IGES, BREP, STL, 3MF, OBJ, AMF, PLY)
    project: 50 * 1024 * 1024,         // 50 MB (Tracery-Projekt .json)
    points: 50 * 1024 * 1024,          // 50 MB (CSV/XYZ Punktwolken)
    image: 20 * 1024 * 1024,           // 20 MB (Aufkleber, Vorlagen, Umgebungsbild)
    font: 15 * 1024 * 1024,            // 15 MB (TTF/OTF)
    svg: 8 * 1024 * 1024,              // 8 MB (SVG)
    dxf: 8 * 1024 * 1024,              // 8 MB (DXF)
    csv: 5 * 1024 * 1024,              // 5 MB (Parameter-/Varianten-CSV)
    settings: 2 * 1024 * 1024,         // 2 MB (Einstellungen)
    zipUncompressed: 200 * 1024 * 1024, // 200 MB gesamt entpackt (ZIP-Bomben-Schutz)
    zipEntry: 100 * 1024 * 1024,       // 100 MB je ZIP-Eintrag
    zipMaxEntries: 2000,
  });

  function tr(key, vars, fallback) {
    if (typeof T === 'function') {
      const s = T(key, vars);
      if (s && s !== key) return s;
    }
    return fallback;
  }

  function formatBytes(n) {
    const v = Math.max(0, Number(n) || 0);
    const fmtN = (x, dec) => (typeof fmtFixed === 'function' ? fmtFixed(x, dec) : x.toFixed(dec).replace('.', ','));
    if (v < 1024) return `${Math.round(v)} B`;
    if (v < 1024 * 1024) return `${fmtN(v / 1024, 1)} KB`;
    return `${fmtN(v / (1024 * 1024), 1)} MB`;
  }

  function checkFileSize(file, kind = 'cad', opts = {}) {
    const limit = opts.limit || LIMITS[kind] || LIMITS.cad;
    if (!file) {
      return { ok: false, reason: 'missing', size: 0, limit, message: tr('import.errNoFile', null, 'Keine Datei zum Einlesen gewählt.') };
    }
    const name = file.name || 'Datei';
    const size = Number(file.size) || 0;
    if (!opts.allowEmpty && size <= 0) {
      return { ok: false, reason: 'empty', size, limit, message: tr('import.errEmpty', { name }, `Die Datei „${name}“ ist leer und kann nicht geöffnet werden.`) };
    }
    if (size > limit) {
      const sizeStr = formatBytes(size);
      const maxStr = formatBytes(limit);
      return {
        ok: false,
        reason: 'too_large',
        size,
        limit,
        message: tr('import.errTooBig', { name, size: sizeStr, max: maxStr }, `Die Datei „${name}“ ist zu groß (${sizeStr} – erlaubt sind höchstens ${maxStr}).`),
      };
    }
    return { ok: true, reason: null, size, limit, message: '' };
  }

  function stripXmlDoctype(xml) {
    let s = String(xml || '').replace(/^\uFEFF/, '');
    s = s.replace(/<\?xml-stylesheet[\s\S]*?\?>/gi, '');
    s = s.replace(/<!DOCTYPE\b[\s\S]*?(?:\[[\s\S]*?\]\s*)?>/gi, '');
    s = s.replace(/<!ENTITY\b[\s\S]*?>/gi, '');
    return s;
  }

  const SVG_FORBIDDEN_TAGS = new Set([
    'script', 'foreignobject', 'iframe', 'object', 'embed', 'applet',
    'audio', 'video', 'canvas', 'link', 'meta', 'base', 'form', 'input', 'button',
    'animate', 'animatemotion', 'animatetransform', 'set', 'handler', 'listener',
  ]);
  const SVG_LINK_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'ping']);
  const SVG_CSS_ATTRS = new Set([
    'style', 'fill', 'stroke', 'filter', 'clip-path', 'mask',
    'marker-start', 'marker-mid', 'marker-end', 'cursor', 'background', 'background-image',
  ]);

  function sanitizeCssText(val, stats, isStyleTag = false) {
    let out = String(val || '');
    const strippedComments = out.replace(/\/\*[\s\S]*?\*\//g, '');
    if (/@import\b/i.test(strippedComments)) {
      stats.externalLinks++;
      out = out.replace(/@import[^;]*(;|$)/gi, '');
    }
    if (/expression\s*\(|(?:javascript|vbscript)\s*:/i.test(strippedComments.replace(/[\u0000-\u0020]+/g, ''))) {
      stats.handlers++;
      out = out.replace(/expression\s*\([^)]*\)/gi, 'none').replace(/(?:javascript|vbscript)\s*:[^;"')]*/gi, 'none');
    }
    out = out.replace(/url\s*\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (m, _q, target) => {
      const t = String(target || '').trim();
      if (/^#[A-Za-z_][\w:.-]*$/.test(t)) return m;
      if (/^(?:javascript|vbscript):/i.test(t.replace(/[\u0000-\u0020]+/g, ''))) stats.handlers++;
      else stats.externalLinks++;
      return 'none';
    });
    if (isStyleTag) return out.trim();
    return out.trim();
  }

  function sanitizeSVG(raw, opts = {}) {
    if (typeof raw !== 'string') {
      return { ok: false, error: tr('import.errSvgBad', null, 'Diese SVG kann ich nicht lesen – die Datei ist beschädigt oder kein gültiges SVG.') };
    }
    const maxChars = opts.maxChars || LIMITS.svg * 2;
    if (raw.length > maxChars) {
      return { ok: false, error: tr('import.errTooBig', { name: opts.name || 'SVG', size: formatBytes(raw.length), max: formatBytes(LIMITS.svg) }, `Die SVG-Datei ist zu groß (erlaubt sind höchstens ${formatBytes(LIMITS.svg)}).`) };
    }
    const cleanedInput = stripXmlDoctype(raw);
    const doc = new DOMParser().parseFromString(cleanedInput, 'image/svg+xml');
    const root = doc && doc.documentElement;
    const rootTag = root ? (root.localName || root.nodeName || '').toLowerCase().replace(/^[^:]+:/, '') : '';
    if (!root || rootTag !== 'svg' || doc.querySelector('parsererror')) {
      return { ok: false, error: tr('import.errSvgBad', null, 'Diese SVG kann ich nicht lesen – die Datei ist beschädigt oder kein gültiges SVG.') };
    }
    const stats = { scripts: 0, handlers: 0, externalLinks: 0, elements: 0, stripped: 0 };
    const cleanNode = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 7) {
          child.remove();
          stats.elements++;
          continue;
        }
        if (child.nodeType !== 1) continue;
        const tag = (child.localName || child.nodeName || '').toLowerCase().replace(/^[^:]+:/, '');
        if (SVG_FORBIDDEN_TAGS.has(tag)) {
          child.remove();
          if (tag === 'script') stats.scripts++;
          else stats.elements++;
          continue;
        }
        if (tag === 'style') {
          child.textContent = sanitizeCssText(child.textContent || '', stats, true);
        }
        for (const attr of [...child.attributes]) {
          const aname = String(attr.name || '').toLowerCase();
          const local = String(attr.localName || aname.replace(/^[^:]+:/, '')).toLowerCase();
          if (/^(?:[a-z0-9_-]+:)?on[a-z]/i.test(aname)) {
            child.removeAttribute(attr.name);
            stats.handlers++;
            continue;
          }
          if (SVG_LINK_ATTRS.has(local)) {
            const val = String(attr.value || '').trim();
            if (!/^#[A-Za-z_][\w:.-]*$/.test(val) || tag === 'a') {
              const compact = val.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
              child.removeAttribute(attr.name);
              if (/^(?:javascript|vbscript|data):/i.test(compact)) stats.handlers++;
              else if (val) stats.externalLinks++;
            }
            continue;
          }
          if (SVG_CSS_ATTRS.has(local)) {
            const nextVal = sanitizeCssText(attr.value, stats, false);
            if (!nextVal) child.removeAttribute(attr.name);
            else if (nextVal !== attr.value) child.setAttribute(attr.name, nextVal);
          }
        }
        cleanNode(child);
      }
    };
    // Root-Attribute ebenfalls prüfen
    for (const attr of [...root.attributes]) {
      const aname = String(attr.name || '').toLowerCase();
      const local = String(attr.localName || aname.replace(/^[^:]+:/, '')).toLowerCase();
      if (/^(?:[a-z0-9_-]+:)?on[a-z]/i.test(aname) || SVG_LINK_ATTRS.has(local)) {
        root.removeAttribute(attr.name);
        if (/on[a-z]/i.test(aname)) stats.handlers++;
        else stats.externalLinks++;
      } else if (SVG_CSS_ATTRS.has(local)) {
        const nextVal = sanitizeCssText(attr.value, stats, false);
        if (!nextVal) root.removeAttribute(attr.name);
        else if (nextVal !== attr.value) root.setAttribute(attr.name, nextVal);
      }
    }
    cleanNode(root);
    stats.stripped = stats.scripts + stats.handlers + stats.externalLinks + stats.elements;
    const svg = new XMLSerializer().serializeToString(root);
    return { ok: true, svg, doc, root, stats };
  }

  function sanitizeImageDataUrl(src, opts = {}) {
    if (typeof src !== 'string') return null;
    const s = src.trim();
    if (!s || s.length > LIMITS.image * 1.4) return null;
    if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(s)) return s;
    if (opts.allowSvg === false) return null;
    const m = /^data:image\/svg\+xml([^,]*),(.*)$/i.exec(s);
    if (!m) return null;
    let svgRaw = '';
    try {
      if (/;base64/i.test(m[1])) {
        svgRaw = new TextDecoder('utf-8').decode(base64ToBytes(m[2].replace(/\s+/g, '')));
      } else {
        svgRaw = decodeURIComponent(m[2]);
      }
    } catch (_) {
      return null;
    }
    const san = sanitizeSVG(svgRaw);
    if (!san.ok) return null;
    return 'data:image/svg+xml;base64,' + bytesToBase64(new TextEncoder().encode(san.svg));
  }

  const BAD_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  function safeParseJSON(raw, opts = {}) {
    if (typeof raw !== 'string') {
      return { ok: false, error: tr('import.errJsonBad', null, 'Die JSON-Datei ist beschädigt oder nicht lesbar.') };
    }
    const limit = opts.limit || LIMITS.project;
    if (raw.length > limit) {
      return { ok: false, error: tr('import.errTooBig', { name: opts.name || 'JSON', size: formatBytes(raw.length), max: formatBytes(limit) }, `Die Datei ist zu groß (erlaubt sind höchstens ${formatBytes(limit)}).`) };
    }
    try {
      const data = JSON.parse(raw.replace(/^\uFEFF/, ''), (k, v) => (BAD_JSON_KEYS.has(k) ? undefined : v));
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e && e.message) || tr('import.errJsonBad', null, 'Die JSON-Datei ist beschädigt oder nicht lesbar.') };
    }
  }

  // ---------- Projektdatei-Prüfung (PL-12, siehe docs/DATEIFORMAT.md) ----------
  const PROJECT_FORMAT = 'masswerk';
  const PROJECT_VERSION = 1;
  const VALID_UNITS = new Set(['mm', 'cm', 'm', 'in']);
  const VALID_DOC_TYPES = new Set(['part', 'assembly']);
  const VALID_ROLES = new Set(['solid', 'hole']);
  const VALID_OP_TYPES = new Set(['join', 'cut', 'common']);
  const VALID_T_KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
  const KNOWN_ITEM_KINDS = new Set([
    'box', 'cylinder', 'tube', 'sphere', 'hemisphere', 'cone', 'pyramid', 'torus', 'prism', 'wedge',
    'extrude', 'revolve', 'loft', 'sweep', 'helix', 'import', 'group', 'part',
    'transform', 'scale', 'deform', 'thicken', 'rib', 'vent', 'fins', 'fillPattern', 'mountPattern', 'portCutout', 'web', 'wrap',
    'emboss', 'splitFace', 'dome', 'mirrorStep', 'deleteBody', 'boss', 'lipGroove',
    'undercut', 'circlipGroove', 'keyway', 'splineProfile', 'knurl', 'gripPattern', 'sketch3d', 'ref',
    'stackHole', 'asmCut',
  ]);
  const OPTIONAL_ARRAY_FIELDS = [
    'notes', 'blocks', 'fonts', 'variants', 'folders',
    'datums', 'axes', 'points', 'csys', 'joints', 'couplings', 'poses', 'measures', 'views', 'selSets', 'pointClouds', 'explodeSteps', 'asmPatterns',
    'displayStates', 'asmVariants', 'tolChains', 'pmi',
  ];

  function validateProject(input, opts = {}) {
    const errors = [];
    const warnings = [];
    let itemCount = 0;
    const isPlainObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;
    const isNumOrExpr = (v) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string';
    const knownKinds = new Set(KNOWN_ITEM_KINDS);
    if (typeof KINDS !== 'undefined' && KINDS) {
      for (const k of Object.keys(KINDS)) knownKinds.add(k);
    }

    let doc = input;
    if (typeof input === 'string') {
      const parsed = safeParseJSON(input, { limit: opts.limit || LIMITS.project, name: opts.name || 'Projektdatei' });
      if (!parsed.ok) {
        const msg = /^Die (?:JSON-)?Datei\b/.test(parsed.error)
          ? parsed.error
          : 'Die Projektdatei ist kein gültiges JSON: ' + parsed.error;
        errors.push(msg);
        return { ok: false, errors, warnings, message: errors[0], version: null, docType: null, itemCount: 0 };
      }
      doc = parsed.data;
    }

    if (!isPlainObj(doc)) {
      errors.push('Die Projektdatei muss ein JSON-Objekt sein.');
      return { ok: false, errors, warnings, message: errors[0], version: null, docType: null, itemCount: 0 };
    }

    // Pflichtfelder auf oberster Ebene
    if (doc.format === undefined || doc.format === null || doc.format === '') {
      errors.push(`Pflichtfeld „format“ fehlt – erwartet wird „${PROJECT_FORMAT}“.`);
    } else if (doc.format !== PROJECT_FORMAT) {
      errors.push(`Ungültiges Format „${String(doc.format)}“ – erwartet wird „${PROJECT_FORMAT}“.`);
    }

    if (doc.version === undefined || doc.version === null) {
      errors.push(`Pflichtfeld „version“ fehlt – erwartet wird eine positive ganze Zahl (aktuell ${PROJECT_VERSION}).`);
    } else if (typeof doc.version !== 'number' || !Number.isInteger(doc.version) || doc.version < 1) {
      errors.push('Ungültige Format-Version im Feld „version“ – erwartet wird eine ganze Zahl ab 1.');
    } else if (doc.version > PROJECT_VERSION) {
      warnings.push(`Die Datei nutzt Format-Version ${doc.version}; diese Tracery-Fassung kennt Version ${PROJECT_VERSION} – neuere Felder könnten nicht unterstützt werden.`);
    }

    if (!isNonEmptyStr(doc.id)) {
      errors.push('Pflichtfeld „id“ fehlt oder ist kein nicht-leerer Text.');
    }
    if (!isNonEmptyStr(doc.name)) {
      errors.push('Pflichtfeld „name“ fehlt oder ist kein nicht-leerer Text.');
    }
    if (!('items' in doc) || doc.items === undefined) {
      errors.push('Pflichtfeld „items“ fehlt – erwartet wird eine Liste von Schritten.');
    } else if (!Array.isArray(doc.items)) {
      errors.push('Feld „items“ muss eine Liste (Array) sein.');
    }

    // Optionale Felder auf oberster Ebene
    if (doc.docType !== undefined && doc.docType !== null && !VALID_DOC_TYPES.has(doc.docType)) {
      errors.push(`Ungültige Dokument-Art in „docType“ („${String(doc.docType)}“) – erlaubt sind „part“ oder „assembly“.`);
    }
    for (const tk of ['created', 'modified']) {
      const tv = doc[tk];
      if (tv !== undefined && tv !== null && (typeof tv !== 'number' || !Number.isFinite(tv))) {
        errors.push(`Feld „${tk}“ muss eine gültige Zeitangabe (Zahl in Millisekunden) sein.`);
      }
    }
    if (doc.noHistory !== undefined && doc.noHistory !== null && typeof doc.noHistory !== 'boolean') {
      errors.push('Feld „noHistory“ muss ein Wahrheitswert (true/false) sein.');
    }
    if (doc.lightweight !== undefined && doc.lightweight !== null && typeof doc.lightweight !== 'boolean') {
      errors.push('Feld „lightweight“ muss ein Wahrheitswert (true/false) sein.');
    }
    if (doc.lightCache !== undefined && doc.lightCache !== null && !isPlainObj(doc.lightCache)) {
      errors.push('Feld „lightCache“ muss ein Objekt sein.');
    }
    if (doc.rollback !== undefined && doc.rollback !== null) {
      if (typeof doc.rollback !== 'number' || !Number.isInteger(doc.rollback) || doc.rollback < 0) {
        errors.push('Feld „rollback“ muss eine ganze Zahl ab 0 oder null sein.');
      } else if (Array.isArray(doc.items) && doc.rollback >= doc.items.length) {
        warnings.push('Zeitleisten-Marker „rollback“ liegt hinter dem letzten Schritt.');
      }
    }
    if (doc.settings !== undefined && doc.settings !== null) {
      if (!isPlainObj(doc.settings)) {
        errors.push('Feld „settings“ muss ein Objekt sein.');
      } else if (doc.settings.unit !== undefined && doc.settings.unit !== null && !VALID_UNITS.has(doc.settings.unit)) {
        errors.push(`Ungültige Projekteinheit „${String(doc.settings.unit)}“ in „settings.unit“ – erlaubt sind mm, cm, m oder in.`);
      }
    }
    if (doc.drawing !== undefined && doc.drawing !== null && !isPlainObj(doc.drawing)) {
      errors.push('Feld „drawing“ muss ein Objekt oder null sein.');
    }
    if (doc.motion !== undefined && doc.motion !== null) {
      if (!isPlainObj(doc.motion)) {
        errors.push('Feld „motion“ muss ein Objekt oder null sein.');
      } else {
        if (doc.motion.duration !== undefined && doc.motion.duration !== null && (typeof doc.motion.duration !== 'number' || !Number.isFinite(doc.motion.duration) || doc.motion.duration <= 0)) {
          errors.push('Feld „motion.duration“ muss eine positive Zahl in Sekunden sein.');
        }
        if (doc.motion.motors !== undefined && doc.motion.motors !== null && !Array.isArray(doc.motion.motors)) {
          errors.push('Feld „motion.motors“ muss eine Liste (Array) sein.');
        }
        if (doc.motion.traces !== undefined && doc.motion.traces !== null && !Array.isArray(doc.motion.traces)) {
          errors.push('Feld „motion.traces“ muss eine Liste (Array) sein.');
        }
      }
    }
    if (doc.params !== undefined && doc.params !== null) {
      if (!Array.isArray(doc.params)) {
        errors.push('Feld „params“ muss eine Liste (Array) sein.');
      } else {
        doc.params.forEach((pr, idx) => {
          if (!isPlainObj(pr)) {
            errors.push(`Maß #${idx + 1} in „params“ muss ein Objekt sein.`);
            return;
          }
          if (!isNonEmptyStr(pr.name)) {
            errors.push(`Maß #${idx + 1} in „params“ braucht ein nicht-leeres Feld „name“.`);
          }
          if (pr.expr === undefined || !isNumOrExpr(pr.expr)) {
            errors.push(`Maß „${isNonEmptyStr(pr.name) ? pr.name : '#' + (idx + 1)}“ in „params“ braucht eine Zahl oder Formel in „expr“.`);
          }
        });
      }
    }
    if (doc.tables !== undefined && doc.tables !== null) {
      if (!Array.isArray(doc.tables)) {
        errors.push('Feld „tables“ muss eine Liste (Array) sein.');
      } else {
        doc.tables.forEach((tb, idx) => {
          if (!isPlainObj(tb)) {
            errors.push(`Tabelle #${idx + 1} in „tables“ muss ein Objekt sein.`);
            return;
          }
          if (typeof tb.name !== 'string') {
            errors.push(`Tabelle #${idx + 1} in „tables“ braucht ein Textfeld „name“.`);
          }
          if (!Array.isArray(tb.rows)) {
            errors.push(`Tabelle „${typeof tb.name === 'string' && tb.name ? tb.name : '#' + (idx + 1)}“ in „tables“ braucht eine Liste „rows“.`);
          }
        });
      }
    }
    for (const k of OPTIONAL_ARRAY_FIELDS) {
      if (doc[k] !== undefined && doc[k] !== null && !Array.isArray(doc[k])) {
        errors.push(`Feld „${k}“ muss eine Liste (Array) sein.`);
      }
    }
    if (doc.versions !== undefined && doc.versions !== null) {
      if (!Array.isArray(doc.versions)) {
        errors.push('Feld „versions“ muss eine Liste (Array) sein.');
      } else if ((opts._depth || 0) < 1) {
        doc.versions.forEach((ver, idx) => {
          if (!isPlainObj(ver)) {
            errors.push(`Eintrag #${idx + 1} in „versions“ muss ein Objekt sein.`);
            return;
          }
          const vName = isNonEmptyStr(ver.name) ? ver.name : '#' + (idx + 1);
          if (ver.doc !== undefined) {
            const sub = validateProject(ver.doc, { ...opts, _depth: (opts._depth || 0) + 1 });
            for (const err of sub.errors) errors.push(`Version „${vName}“: ${err}`);
            for (const wrn of sub.warnings) warnings.push(`Version „${vName}“: ${wrn}`);
          }
        });
      }
    }

    // Schritte und Gruppen in items prüfen
    const seenIds = new Set();
    const checkItems = (list, pathPrefix, depth) => {
      if (depth > 64) {
        errors.push('Die Verschachtelung der Gruppen in „items“ ist zu tief (höchstens 64 Ebenen).');
        return;
      }
      list.forEach((it, idx) => {
        const tag = `${pathPrefix}#${idx + 1}`;
        if (!isPlainObj(it)) {
          errors.push(`Schritt ${tag} muss ein Objekt sein.`);
          return;
        }
        itemCount++;
        const lbl = isNonEmptyStr(it.name) ? `„${it.name}“` : (isNonEmptyStr(it.id) ? `„${it.id}“` : tag);
        if (!isNonEmptyStr(it.id)) {
          errors.push(`Schritt ${lbl}: Pflichtfeld „id“ fehlt oder ist leer.`);
        } else if (seenIds.has(it.id)) {
          errors.push(`Doppelte Schritt-Kennung „${it.id}“ gefunden.`);
        } else {
          seenIds.add(it.id);
        }
        if (!isNonEmptyStr(it.kind)) {
          errors.push(`Schritt ${lbl}: Pflichtfeld „kind“ fehlt oder ist leer.`);
        } else if (!knownKinds.has(it.kind)) {
          warnings.push(`Schritt ${lbl}: unbekannte Schritt-Art „${it.kind}“ (eventuell aus einer neueren Tracery-Fassung).`);
        }
        if (it.role !== undefined && !VALID_ROLES.has(it.role)) {
          errors.push(`Schritt ${lbl}: ungültige Rolle „${String(it.role)}“ – erlaubt sind „solid“ oder „hole“.`);
        }
        if (it.t !== undefined && it.t !== null) {
          if (!isPlainObj(it.t)) {
            errors.push(`Schritt ${lbl}: Feld „t“ (Lage) muss ein Objekt sein.`);
          } else {
            for (const tk of VALID_T_KEYS) {
              if (it.t[tk] !== undefined && it.t[tk] !== null && !isNumOrExpr(it.t[tk])) {
                errors.push(`Schritt ${lbl}: Lagewert „t.${tk}“ muss eine Zahl oder Formel sein.`);
              }
            }
          }
        }
        if (it.p !== undefined && it.p !== null && !isPlainObj(it.p)) {
          errors.push(`Schritt ${lbl}: Feld „p“ (Parameter) muss ein Objekt sein.`);
        }
        if (it.op !== undefined && it.op !== null) {
          if (!isPlainObj(it.op) || !VALID_OP_TYPES.has(it.op.type)) {
            errors.push(`Schritt ${lbl}: Feld „op“ braucht eine gültige Art („join“, „cut“ oder „common“).`);
          }
        }
        if (it.finishes !== undefined && it.finishes !== null) {
          if (!Array.isArray(it.finishes)) {
            errors.push(`Schritt ${lbl}: Feld „finishes“ muss eine Liste sein.`);
          } else {
            it.finishes.forEach((fin, fi) => {
              if (!isPlainObj(fin) || !isNonEmptyStr(fin.type)) {
                errors.push(`Schritt ${lbl}: Nachbearbeitung #${fi + 1} in „finishes“ braucht ein Feld „type“.`);
              }
            });
          }
        }
        if (it.kind === 'ref' && (!isPlainObj(it.p) || !isNonEmptyStr(it.p.docId))) {
          errors.push(`Verweis-Schritt ${lbl}: Pflichtfeld „p.docId“ fehlt.`);
        }
        if (it.kind === 'import' && (!isPlainObj(it.p) || (!isNonEmptyStr(it.p.data) && !isNonEmptyStr(it.p.blobId) && !it.p.bytes))) {
          warnings.push(`Import-Schritt ${lbl}: enthält keine Geometriedaten („p.data“ oder „p.blobId“).`);
        }
        if ((it.kind === 'extrude' || it.kind === 'revolve') && isPlainObj(it.p) && it.p.sketch !== undefined && it.p.sketch !== null) {
          if (!isPlainObj(it.p.sketch) || !Array.isArray(it.p.sketch.ents)) {
            errors.push(`Schritt ${lbl}: „p.sketch“ muss ein Objekt mit einer Element-Liste „ents“ sein.`);
          }
        }
        if (it.kind === 'loft' && isPlainObj(it.p) && it.p.sketches !== undefined && it.p.sketches !== null && !Array.isArray(it.p.sketches)) {
          errors.push(`Schritt ${lbl}: „p.sketches“ muss eine Liste sein.`);
        }
        if (it.kind === 'sketch3d' && isPlainObj(it.p) && it.p.sketch3d !== undefined && it.p.sketch3d !== null) {
          if (!isPlainObj(it.p.sketch3d) || !Array.isArray(it.p.sketch3d.ents)) {
            errors.push(`Schritt ${lbl}: „p.sketch3d“ muss ein Objekt mit einer Element-Liste „ents“ sein.`);
          }
        }
        if (it.children !== undefined && it.children !== null) {
          if (!Array.isArray(it.children)) {
            errors.push(`Schritt ${lbl}: Feld „children“ muss eine Liste sein.`);
          } else {
            checkItems(it.children, `${pathPrefix}${idx + 1}.`, depth + 1);
          }
        }
      });
    };
    if (Array.isArray(doc.items)) checkItems(doc.items, '', 0);

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      message: errors.length ? errors[0] : '',
      version: Number.isInteger(doc.version) ? doc.version : null,
      docType: VALID_DOC_TYPES.has(doc.docType) ? doc.docType : (doc.docType == null ? 'part' : null),
      itemCount,
    };
  }

  return {
    init, ensureDB, whenIdle,
    LIMITS, PROJECT_FORMAT, PROJECT_VERSION, formatBytes, checkFileSize, stripXmlDoctype, sanitizeSVG, sanitizeImageDataUrl, safeParseJSON, validateProject,
    bytesToBase64, base64ToBytes,
    registerBlob, putBlob, getBlobSync, getBlob, flushBlobs,
    extractBlobs, collectBlobIds, hydrateDoc, inlineBlobs,
    recentProjects, hasProject, getLastId, getOpenTabs, setOpenTabs, saveProject, loadProject, getCachedProject, ensureDocsLoaded, deleteProject, gcBlobs,
    on: ev.on,
    loadVersions, getVersionsSync, setVersions,
    saveRecovery, loadRecovery, clearRecovery, getRecoveryFlag,
    get ready() { return ready; },
    get hasProjects() { return index.length > 0 || !!lastId; },
    get dbName() { return DB_NAME; },
    get usingIDB() { return usingIDB; },
  };
})();
