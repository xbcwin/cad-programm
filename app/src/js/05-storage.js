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
  const fallbackProjects = new Map();
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
    if (!doc || !Array.isArray(doc.items)) return set;
    walkItems(doc.items, (it) => {
      if (it && it.kind === 'import' && it.p && it.p.blobId) set.add(it.p.blobId);
    });
    return set;
  }
  async function hydrateDoc(doc) {
    if (!doc || !Array.isArray(doc.items)) return doc;
    extractBlobs(doc);
    const missing = [...collectBlobIds(doc)].filter((id) => !blobCache.has(id));
    if (missing.length) await Promise.all(missing.map((id) => getBlob(id)));
    return doc;
  }
  async function inlineBlobs(doc) {
    if (!doc) return doc;
    extractBlobs(doc);
    const out = deepClone(doc);
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
        migratedEntries.set(id, { id, name: doc.name || 'Projekt', modified: doc.modified || Date.now(), n: countItems(doc) });
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
    index = index.filter((x) => x.id !== snap.id);
    index.unshift({ id: snap.id, name: snap.name, modified: snap.modified, n });
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
        return storageSet('masswerk.proj.' + snap.id, JSON.stringify(snap));
      }
      const tx = d.transaction(['projects', 'meta'], 'readwrite');
      tx.objectStore('projects').put(snap);
      const m = tx.objectStore('meta');
      m.put({ k: 'index', v: idxSnap });
      if (updateLast && lastSnap) m.put({ k: 'last', v: lastSnap });
      return txDone(tx);
    }).catch((e) => { console.warn('Projekt speichern:', e); return false; });
  }

  async function loadProject(id) {
    if (!id) return null;
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
    await hydrateDoc(doc);
    await loadVersions(id).catch(() => {});
    return doc;
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

  return {
    init, ensureDB, whenIdle,
    bytesToBase64, base64ToBytes,
    registerBlob, putBlob, getBlobSync, getBlob, flushBlobs,
    extractBlobs, collectBlobIds, hydrateDoc, inlineBlobs,
    recentProjects, hasProject, getLastId, getOpenTabs, setOpenTabs, saveProject, loadProject, deleteProject, gcBlobs,
    loadVersions, getVersionsSync, setVersions,
    saveRecovery, loadRecovery, clearRecovery, getRecoveryFlag,
    get ready() { return ready; },
    get hasProjects() { return index.length > 0 || !!lastId; },
    get dbName() { return DB_NAME; },
    get usingIDB() { return usingIDB; },
  };
})();
