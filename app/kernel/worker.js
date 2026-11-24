import Module from './occ.js';
import * as R from './replicad/index.js';
import { createKernel } from './core.js';
// Worker-Hülle: lädt den CAD-Kern und beantwortet Anfragen der Seite.
let kernel = null;

async function init(wasm) {
  const t0 = performance.now();
  const oc = await Module({ wasmBinary: wasm, locateFile: () => 'occ-kernel.wasm' });
  R.setOC(oc);
  kernel = createKernel(R, oc);
  return { ms: Math.round(performance.now() - t0) };
}

function transferList(obj, list = []) {
  if (!obj || typeof obj !== 'object') return list;
  if (ArrayBuffer.isView(obj)) { list.push(obj.buffer); return list; }
  if (obj instanceof ArrayBuffer) { list.push(obj); return list; }
  if (Array.isArray(obj)) { for (const v of obj) if (v && typeof v === 'object') transferList(v, list); return list; }
  for (const k in obj) { const v = obj[k]; if (v && typeof v === 'object') transferList(v, list); }
  return list;
}

self.onmessage = async (ev) => {
  const { id, cmd, args } = ev.data || {};
  try {
    let result;
    if (cmd === 'init') result = await init(args.wasm);
    else if (!kernel) throw new Error('Der CAD-Kern ist noch nicht bereit.');
    else if (cmd === 'evaluate') result = kernel.evaluate(args.scene, args.known);
    else if (cmd === 'exportMeshes') result = kernel.exportMeshes(args.scene, args.fine, args.q, args.originMat);
    else if (cmd === 'exportSTEP') result = { data: await kernel.exportSTEP(args.scene, args.only, args.originMat).arrayBuffer() };
    else if (cmd === 'exportIGES') result = { data: await kernel.exportIGES(args.scene, args.only, args.originMat).arrayBuffer() };
    else if (cmd === 'exportBREP') result = { data: await kernel.exportBREP(args.scene, args.only, args.originMat).arrayBuffer() };
    else if (cmd === 'measure') result = kernel.measure(args.scene);
    else if (cmd === 'distance') result = kernel.minDistance(args.scene, args.ids);
    else if (cmd === 'project') result = kernel.project(args.scene, args.views);
    else if (cmd === 'clashes') result = kernel.clashes(args.scene, args.probes, args.skipPairs);
    else if (cmd === 'holeWalls') result = kernel.holeWalls(args.scene, args.ids, args);
    else if (cmd === 'faceLoops') result = kernel.faceLoopsOf(args.key, args.faceIdx);
    else if (cmd === 'faceGrid') result = kernel.faceGridOf(args.key, args.faceIdx);
    else if (cmd === 'section') result = kernel.sectionOf(args.key, args.o, args.n);
    else if (cmd === 'remesh') result = kernel.remesh(args.key, args.tol);
    else throw new Error('Unbekannter Befehl: ' + cmd);
    const tl = [];
    // nur große Arrays übertragen (Kopien sind in der Nutzlast schon neu)
    transferList(result, tl);
    self.postMessage({ id, ok: true, result }, [...new Set(tl)]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err || 'Fehler') });
  }
};
self.postMessage({ id: 0, ok: true, result: 'loaded' });
