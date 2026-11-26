// Service Worker für Tracery – speichert alle eigenen Dateien für die Nutzung ohne Internet.
// CACHE_NAME und PRECACHE_FILES werden von tools/build.py automatisch eingesetzt.
const CACHE_NAME = "tracery-offline-258f0f38244e";
const PRECACHE_FILES = [
  "assets/app-icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png",
  "assets/logo.svg",
  "assets/textures/holz.png",
  "assets/textures/karbon.png",
  "assets/textures/metall-gebuerstet.png",
  "data/bauteile.json",
  "data/beispiele/baugruppe-scharnier.svg",
  "data/beispiele/baugruppe-scharnier.tracery.json",
  "data/beispiele/halterung.svg",
  "data/beispiele/halterung.tracery.json",
  "data/beispiele/handyhalter.svg",
  "data/beispiele/handyhalter.tracery.json",
  "data/beispiele/index.json",
  "data/beispiele/kiste-mit-deckel.svg",
  "data/beispiele/kiste-mit-deckel.tracery.json",
  "data/beispiele/schild.svg",
  "data/beispiele/schild.tracery.json",
  "data/beispiele/vase.svg",
  "data/beispiele/vase.tracery.json",
  "data/beispiele/zahnrad-paar.svg",
  "data/beispiele/zahnrad-paar.tracery.json",
  "data/beispiele/zeichnung.svg",
  "data/beispiele/zeichnung.tracery.json",
  "data/dichtungen.json",
  "data/drucker.json",
  "data/einfuehrung-skizze.json",
  "data/faustregeln.json",
  "data/federn.json",
  "data/fehlermeldungen.json",
  "data/formel-beispiele.json",
  "data/fpv-masse.json",
  "data/fremde-bausteine.json",
  "data/gewinde.json",
  "data/iso286.json",
  "data/lager.json",
  "data/materialien.json",
  "data/passfedern.json",
  "data/passstifte.json",
  "data/rahmen.json",
  "data/ral-farben.json",
  "data/schrauben.json",
  "data/schrift-LIZENZ.txt",
  "data/schrift-einlinig.json",
  "data/schrift-inter-fett.json",
  "data/schrift-inter.json",
  "data/schritt-erklaerungen.json",
  "data/schub.json",
  "data/texte-de.json",
  "data/texte-en.json",
  "data/werkzeug-hilfen.json",
  "index.html",
  "kernel/core.js",
  "kernel/occ.js",
  "kernel/replicad/Sketcher.js",
  "kernel/replicad/Sketcher2d.js",
  "kernel/replicad/_deps/flatbush.js",
  "kernel/replicad/_deps/manifold-types.js",
  "kernel/replicad/_deps/occ-types.js",
  "kernel/replicad/_deps/opentype.js",
  "kernel/replicad/addThickness.js",
  "kernel/replicad/blueprints/Blueprint.js",
  "kernel/replicad/blueprints/Blueprints.js",
  "kernel/replicad/blueprints/CompoundBlueprint.js",
  "kernel/replicad/blueprints/approximations.js",
  "kernel/replicad/blueprints/boolean2D.js",
  "kernel/replicad/blueprints/booleanOperations.js",
  "kernel/replicad/blueprints/cannedBlueprints.js",
  "kernel/replicad/blueprints/customCorners.js",
  "kernel/replicad/blueprints/index.js",
  "kernel/replicad/blueprints/lib.js",
  "kernel/replicad/blueprints/offset.js",
  "kernel/replicad/blueprints/svg.js",
  "kernel/replicad/constants.js",
  "kernel/replicad/curves.js",
  "kernel/replicad/definitionMaps.js",
  "kernel/replicad/draw.js",
  "kernel/replicad/export/assemblyExporter.js",
  "kernel/replicad/finders/cornerFinder.js",
  "kernel/replicad/finders/definitions.js",
  "kernel/replicad/finders/edgeFinder.js",
  "kernel/replicad/finders/faceFinder.js",
  "kernel/replicad/finders/generic3dfinder.js",
  "kernel/replicad/finders/helpers.js",
  "kernel/replicad/finders/index.js",
  "kernel/replicad/geom.js",
  "kernel/replicad/geomHelpers.js",
  "kernel/replicad/importers.js",
  "kernel/replicad/index.js",
  "kernel/replicad/lib2d/BoundingBox2d.js",
  "kernel/replicad/lib2d/Curve2D.js",
  "kernel/replicad/lib2d/approximations.js",
  "kernel/replicad/lib2d/customCorners.js",
  "kernel/replicad/lib2d/definitions.js",
  "kernel/replicad/lib2d/index.js",
  "kernel/replicad/lib2d/intersections.js",
  "kernel/replicad/lib2d/makeCurves.js",
  "kernel/replicad/lib2d/ocWrapper.js",
  "kernel/replicad/lib2d/offset.js",
  "kernel/replicad/lib2d/stitching.js",
  "kernel/replicad/lib2d/svgPath.js",
  "kernel/replicad/lib2d/utils.js",
  "kernel/replicad/lib2d/vectorOperations.js",
  "kernel/replicad/manifoldlib.js",
  "kernel/replicad/measureShape.js",
  "kernel/replicad/meshShapes.js",
  "kernel/replicad/oclib.js",
  "kernel/replicad/projection/ProjectionCamera.js",
  "kernel/replicad/projection/index.js",
  "kernel/replicad/projection/makeProjectedEdges.js",
  "kernel/replicad/register.js",
  "kernel/replicad/shapeFunctions/casting.js",
  "kernel/replicad/shapeFunctions/edgeOperations.js",
  "kernel/replicad/shapeFunctions/export.js",
  "kernel/replicad/shapeFunctions/faceGeometry.js",
  "kernel/replicad/shapeFunctions/geometry.js",
  "kernel/replicad/shapeFunctions/index.js",
  "kernel/replicad/shapeFunctions/mesh.js",
  "kernel/replicad/shapeFunctions/operations.js",
  "kernel/replicad/shapeFunctions/shapeInput.js",
  "kernel/replicad/shapeFunctions/topology.js",
  "kernel/replicad/shapeHelpers.js",
  "kernel/replicad/shapeInterfaces.js",
  "kernel/replicad/shapes.js",
  "kernel/replicad/shortcuts.js",
  "kernel/replicad/sketcherlib.js",
  "kernel/replicad/sketches/CompoundSketch.js",
  "kernel/replicad/sketches/Sketch.js",
  "kernel/replicad/sketches/Sketches.js",
  "kernel/replicad/sketches/cannedSketches.js",
  "kernel/replicad/sketches/index.js",
  "kernel/replicad/sketches/lib.js",
  "kernel/replicad/text.js",
  "kernel/replicad/utils/precisionRound.js",
  "kernel/replicad/utils/range.js",
  "kernel/replicad/utils/round2.js",
  "kernel/replicad/utils/round5.js",
  "kernel/replicad/utils/uuid.js",
  "kernel/replicad/utils/zip.js",
  "kernel/worker.js",
  "lib/three/build/three.module.js",
  "lib/three/examples/jsm/controls/OrbitControls.js",
  "lib/three/examples/jsm/lines/LineMaterial.js",
  "lib/three/examples/jsm/lines/LineSegments2.js",
  "lib/three/examples/jsm/lines/LineSegmentsGeometry.js",
  "manifest.webmanifest",
  "occ-kernel.wasm"
];
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
