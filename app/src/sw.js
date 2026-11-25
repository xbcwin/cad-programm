// Service Worker für Tracery – speichert alle eigenen Dateien für die Nutzung ohne Internet.
// CACHE_NAME und PRECACHE_FILES werden von tools/build.py automatisch eingesetzt.
const CACHE_NAME = __CACHE_NAME__;
const PRECACHE_FILES = __PRECACHE_FILES__;
const CACHE_PREFIX = 'tracery-offline-';

function scopeUrl(rel) {
  return new URL(rel, self.registration.scope).href;
}

async function fetchWithRetry(url, tries = 2) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const resp = await fetch(new Request(url, { cache: 'reload' }));
      if (resp && resp.ok) return resp;
      lastErr = new Error('HTTP ' + (resp ? resp.status : 0) + ' für ' + url);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Laden fehlgeschlagen: ' + url);
}

async function precacheAll() {
  const cache = await caches.open(CACHE_NAME);
  const queue = PRECACHE_FILES.slice().sort((a, b) => (
    a === 'index.html' ? -1 : b === 'index.html' ? 1
      : a === 'occ-kernel.wasm' ? 1 : b === 'occ-kernel.wasm' ? -1 : 0
  ));
  const workers = Array.from({ length: Math.min(2, queue.length || 1) }, async () => {
    while (queue.length) {
      const rel = queue.shift();
      const url = scopeUrl(rel);
      if (rel === 'index.html') {
        const rootUrl = scopeUrl('./');
        const hasIndex = await cache.match(url);
        const hasRoot = await cache.match(rootUrl);
        if (hasIndex && hasRoot) continue;
        const resp = hasIndex || (await fetchWithRetry(url));
        if (!hasRoot) await cache.put(rootUrl, resp.clone());
        if (!hasIndex) await cache.put(url, resp);
      } else {
        if (await cache.match(url)) continue;
        const resp = await fetchWithRetry(url);
        await cache.put(url, resp);
      }
    }
  });
  await Promise.all(workers);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAll().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  if (url.href === self.location.href) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    let hit = await cache.match(req);
    if (!hit && url.search) hit = await cache.match(url.origin + url.pathname);
    if (!hit && (req.mode === 'navigate' || url.pathname === scope.pathname)) {
      hit = (await cache.match(scopeUrl('index.html'))) || (await cache.match(scopeUrl('./')));
    }
    if (hit) return hit;

    try {
      const resp = await fetch(req);
      if (resp && resp.ok && resp.type === 'basic') {
        cache.put(req, resp.clone()).catch(() => {});
      }
      return resp;
    } catch (err) {
      if (req.mode === 'navigate') {
        const fallback = (await cache.match(scopeUrl('index.html'))) || (await cache.match(scopeUrl('./')));
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
