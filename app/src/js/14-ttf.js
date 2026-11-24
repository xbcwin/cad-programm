// ================= TrueType-Leser (TTF: glyf-Umrisse, cmap, hmtx, kern) =================
const TTF = (() => {
  function toUint8(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (typeof input === 'string') {
      const s = input.includes(',') && input.startsWith('data:') ? input.slice(input.indexOf(',') + 1) : input;
      if (typeof Store !== 'undefined' && Store.base64ToBytes) return Store.base64ToBytes(s);
      const bin = atob(s);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    }
    return new Uint8Array(0);
  }

  function ascii4(bytes, off) {
    return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  }

  function decodeUtf16BE(bytes, off, len) {
    let out = '';
    for (let i = 0; i + 1 < len; i += 2) {
      out += String.fromCharCode((bytes[off + i] << 8) | bytes[off + i + 1]);
    }
    return out;
  }

  function decodeLatin1(bytes, off, len) {
    let out = '';
    for (let i = 0; i < len; i++) out += String.fromCharCode(bytes[off + i]);
    return out;
  }

  function readName(bytes, dv, tbl) {
    if (!tbl || tbl.len < 6) return '';
    const off = tbl.off;
    const count = dv.getUint16(off + 2, false);
    const strOff = off + dv.getUint16(off + 4, false);
    if (off + 6 + count * 12 > bytes.byteLength) return '';
    const recs = [];
    for (let i = 0; i < count; i++) {
      const r = off + 6 + i * 12;
      const pId = dv.getUint16(r, false);
      const eId = dv.getUint16(r + 2, false);
      const lId = dv.getUint16(r + 4, false);
      const nId = dv.getUint16(r + 6, false);
      const len = dv.getUint16(r + 8, false);
      const sOff = strOff + dv.getUint16(r + 10, false);
      if (sOff + len > off + tbl.len || !len) continue;
      if (nId !== 1 && nId !== 2 && nId !== 4) continue;
      let txt = '';
      if (pId === 3 && (eId === 1 || eId === 10)) txt = decodeUtf16BE(bytes, sOff, len);
      else if (pId === 0) txt = decodeUtf16BE(bytes, sOff, len);
      else if (pId === 1 && eId === 0) txt = decodeLatin1(bytes, sOff, len);
      else continue;
      txt = txt.replace(/\0/g, '').trim();
      if (!txt) continue;
      const rank = (pId === 3 ? 20 : pId === 0 ? 10 : 1) + (lId === 0x0407 || lId === 0x0409 ? 5 : 0);
      recs.push({ nId, rank, txt });
    }
    const pick = (id) => recs.filter((x) => x.nId === id).sort((a, b) => b.rank - a.rank)[0];
    const full = pick(4);
    if (full) return full.txt;
    const fam = pick(1);
    const sub = pick(2);
    if (fam) return sub && !/^(regular|normal|standard)$/i.test(sub.txt) ? `${fam.txt} ${sub.txt}` : fam.txt;
    return '';
  }

  function parseCmap(bytes, dv, tbl) {
    const off = tbl.off;
    if (off + 4 > bytes.byteLength) throw new Error('Die Zeichen-Tabelle (cmap) der Schrift ist beschädigt.');
    const numSub = dv.getUint16(off + 2, false);
    const subs = [];
    for (let i = 0; i < numSub; i++) {
      const r = off + 4 + i * 8;
      if (r + 8 > bytes.byteLength) break;
      const pId = dv.getUint16(r, false);
      const eId = dv.getUint16(r + 2, false);
      const subOff = off + dv.getUint32(r + 4, false);
      if (subOff + 4 > bytes.byteLength) continue;
      const fmt = dv.getUint16(subOff, false);
      let prio = -1;
      if (fmt === 12 && ((pId === 3 && eId === 10) || pId === 0)) prio = 40;
      else if (fmt === 4 && pId === 3 && (eId === 1 || eId === 10)) prio = 35;
      else if (fmt === 4 && pId === 0) prio = 30;
      else if (fmt === 4) prio = 20;
      else if (fmt === 6) prio = 10;
      else if (fmt === 0) prio = 5;
      if (prio > 0) subs.push({ prio, fmt, subOff });
    }
    subs.sort((a, b) => b.prio - a.prio);
    const best = subs[0];
    if (!best) throw new Error('In der Schrift fehlt eine lesbare Unicode-Zuordnung (cmap).');

    const sub = best.subOff;
    if (best.fmt === 12) {
      const numGroups = dv.getUint32(sub + 12, false);
      return (cp) => {
        let lo = 0, hi = numGroups - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const g = sub + 16 + mid * 12;
          if (g + 12 > bytes.byteLength) return 0;
          const sc = dv.getUint32(g, false);
          const ec = dv.getUint32(g + 4, false);
          if (cp < sc) hi = mid - 1;
          else if (cp > ec) lo = mid + 1;
          else return dv.getUint32(g + 8, false) + (cp - sc);
        }
        return 0;
      };
    }
    if (best.fmt === 4) {
      const segCount = dv.getUint16(sub + 6, false) >> 1;
      const endOff = sub + 14;
      const startOff = endOff + segCount * 2 + 2;
      const deltaOff = startOff + segCount * 2;
      const rangeOff = deltaOff + segCount * 2;
      return (cp) => {
        if (cp > 0xFFFF) return 0;
        let lo = 0, hi = segCount - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const ec = dv.getUint16(endOff + mid * 2, false);
          if (cp > ec) { lo = mid + 1; continue; }
          const sc = dv.getUint16(startOff + mid * 2, false);
          if (cp < sc) { hi = mid - 1; continue; }
          const idDelta = dv.getInt16(deltaOff + mid * 2, false);
          const idRO = dv.getUint16(rangeOff + mid * 2, false);
          if (idRO === 0) return (cp + idDelta) & 0xFFFF;
          const addr = rangeOff + mid * 2 + idRO + (cp - sc) * 2;
          if (addr + 2 > bytes.byteLength) return 0;
          const gid = dv.getUint16(addr, false);
          return gid ? (gid + idDelta) & 0xFFFF : 0;
        }
        return 0;
      };
    }
    if (best.fmt === 6) {
      const first = dv.getUint16(sub + 6, false);
      const count = dv.getUint16(sub + 8, false);
      return (cp) => {
        const idx = cp - first;
        if (idx < 0 || idx >= count || sub + 10 + idx * 2 + 2 > bytes.byteLength) return 0;
        return dv.getUint16(sub + 10 + idx * 2, false);
      };
    }
    return (cp) => (cp >= 0 && cp < 256 && sub + 6 + cp < bytes.byteLength ? bytes[sub + 6 + cp] : 0);
  }

  function parseKern(bytes, dv, tbl) {
    const map = new Map();
    if (!tbl || tbl.len < 4) return map;
    const off = tbl.off;
    const end = off + tbl.len;
    const ver0 = dv.getUint16(off, false);
    if (ver0 === 0) {
      const nTables = dv.getUint16(off + 2, false);
      let p = off + 4;
      for (let t = 0; t < nTables && p + 6 <= end; t++) {
        const len = dv.getUint16(p + 2, false);
        const cov = dv.getUint16(p + 4, false);
        if (len < 6 || p + len > end) break;
        const fmt = cov >> 8;
        const horiz = (cov & 1) !== 0;
        const minOrCross = (cov & 6) !== 0;
        const override = (cov & 8) !== 0;
        if (fmt === 0 && horiz && !minOrCross && p + 14 <= end) {
          const nPairs = dv.getUint16(p + 6, false);
          let q = p + 14;
          for (let i = 0; i < nPairs && q + 6 <= p + len; i++, q += 6) {
            const l = dv.getUint16(q, false);
            const r = dv.getUint16(q + 2, false);
            const v = dv.getInt16(q + 4, false);
            if (!v) continue;
            const k = l * 65536 + r;
            map.set(k, override ? v : (map.get(k) || 0) + v);
          }
        }
        p += len;
      }
    } else if (dv.getUint32(off, false) === 0x00010000 && tbl.len >= 8) {
      const nTables = dv.getUint32(off + 4, false);
      let p = off + 8;
      for (let t = 0; t < nTables && p + 8 <= end; t++) {
        const len = dv.getUint32(p, false);
        const cov = dv.getUint16(p + 4, false);
        if (len < 8 || p + len > end) break;
        const fmt = cov & 0xFF;
        const horiz = (cov & 0x8000) === 0 && (cov & 0x4000) === 0;
        if (fmt === 0 && horiz && p + 16 <= end) {
          const nPairs = dv.getUint32(p + 8, false);
          let q = p + 16;
          for (let i = 0; i < nPairs && q + 6 <= p + len; i++, q += 6) {
            const l = dv.getUint16(q, false);
            const r = dv.getUint16(q + 2, false);
            const v = dv.getInt16(q + 4, false);
            if (!v) continue;
            const k = l * 65536 + r;
            map.set(k, (map.get(k) || 0) + v);
          }
        }
        p += len;
      }
    }
    return map;
  }

  function quadSeg(cur, q, e) {
    const dx = e[0] - cur[0], dy = e[1] - cur[1];
    const len = Math.hypot(dx, dy);
    if (len <= 1e-4 && Math.hypot(q[0] - cur[0], q[1] - cur[1]) <= 1e-4) return null;
    // Kollineare quadratische Kurven ohne Knick zu einer Linie vereinfachen (vermeidet entartete Bézier-Kanten im Kern)
    if (len > 1e-4) {
      const qx = q[0] - cur[0], qy = q[1] - cur[1];
      const cross = Math.abs(dx * qy - dy * qx);
      const proj = (qx * dx + qy * dy) / len;
      if (cross <= 1e-3 * len && proj >= -1e-4 && proj <= len + 1e-4) {
        return { t: 'line', a: cur, b: e };
      }
    }
    return {
      t: 'bez',
      a: cur,
      c1: [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])],
      c2: [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])],
      b: e,
    };
  }

  function contourToSegs(pts) {
    const n = pts.length;
    if (n < 2) return [];
    let ordered;
    if (pts[0].on) {
      ordered = pts.slice(1);
      ordered.push({ x: pts[0].x, y: pts[0].y, on: true });
    } else if (pts[n - 1].on) {
      ordered = pts.slice(0, n - 1);
      ordered.unshift(pts[n - 1]);
      ordered = ordered.slice(1);
      ordered.push({ x: pts[n - 1].x, y: pts[n - 1].y, on: true });
    } else {
      const start = { x: (pts[n - 1].x + pts[0].x) / 2, y: (pts[n - 1].y + pts[0].y) / 2, on: true };
      ordered = pts.slice();
      ordered.push(start);
      ordered = [start, ...ordered];
      ordered.shift();
    }
    const startPt = ordered[ordered.length - 1];
    let cur = [startPt.x, startPt.y];
    const segs = [];
    for (let i = 0; i < ordered.length;) {
      const p = ordered[i];
      if (p.on) {
        const ep = [p.x, p.y];
        if (Math.hypot(ep[0] - cur[0], ep[1] - cur[1]) > 1e-4) {
          segs.push({ t: 'line', a: cur, b: ep });
          cur = ep;
        }
        i++;
      } else {
        const next = ordered[i + 1];
        let ep, step;
        if (!next || next.on) {
          ep = next ? [next.x, next.y] : [startPt.x, startPt.y];
          step = 2;
        } else {
          ep = [(p.x + next.x) / 2, (p.y + next.y) / 2];
          step = 1;
        }
        const seg = quadSeg(cur, [p.x, p.y], ep);
        if (seg) {
          segs.push(seg);
          cur = ep;
        }
        i += step;
      }
    }
    if (segs.length) {
      const first = segs[0].a;
      const last = segs[segs.length - 1];
      const d = Math.hypot(last.b[0] - first[0], last.b[1] - first[1]);
      if (d > 1e-4) segs.push({ t: 'line', a: last.b, b: first });
      else last.b = first;
    }
    return segs;
  }

  function parse(input, opts = {}) {
    const bytes = toUint8(input);
    if (bytes.byteLength < 12) throw new Error('Diese Datei ist keine gültige TrueType-Schrift (.ttf).');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sfnt = dv.getUint32(0, false);
    if (sfnt === 0x4F54544F) throw new Error('OTF/CFF-Schriften werden noch nicht unterstützt – bitte wähle eine TrueType-Schrift (.ttf).');
    if (sfnt === 0x774F4646 || sfnt === 0x774F4632) throw new Error('WOFF-Webschriften werden noch nicht unterstützt – bitte wähle eine TrueType-Schrift (.ttf).');
    if (sfnt === 0x74746366) throw new Error('Schrift-Sammlungen (.ttc) werden noch nicht unterstützt – bitte eine einzelne TrueType-Schrift (.ttf) wählen.');
    if (sfnt !== 0x00010000 && sfnt !== 0x74727565) throw new Error('Diese Datei ist keine gültige TrueType-Schrift (.ttf).');

    const numTables = dv.getUint16(4, false);
    if (12 + numTables * 16 > bytes.byteLength) throw new Error('Die Schriftdatei ist unvollständig oder beschädigt.');
    const tables = {};
    for (let i = 0; i < numTables; i++) {
      const p = 12 + i * 16;
      const tag = ascii4(bytes, p);
      const off = dv.getUint32(p + 8, false);
      const len = dv.getUint32(p + 12, false);
      if (off + len <= bytes.byteLength) tables[tag] = { off, len };
    }
    if ((tables['CFF '] || tables.CFF2) && !tables.glyf) {
      throw new Error('OTF/CFF-Schriften werden noch nicht unterstützt – bitte wähle eine TrueType-Schrift (.ttf).');
    }
    for (const req of ['head', 'hhea', 'maxp', 'hmtx', 'cmap', 'loca', 'glyf']) {
      if (!tables[req]) throw new Error(`In der Schrift fehlt die Tabelle „${req}“ – sie ist keine vollständige TrueType-Schrift (.ttf).`);
    }

    const head = tables.head;
    const hhea = tables.hhea;
    const maxp = tables.maxp;
    const hmtx = tables.hmtx;
    const loca = tables.loca;
    const glyf = tables.glyf;

    const em = dv.getUint16(head.off + 18, false) || 1000;
    const idxFmt = dv.getInt16(head.off + 50, false);
    const numGlyphs = dv.getUint16(maxp.off + 4, false);
    const asc = dv.getInt16(hhea.off + 4, false);
    const desc = dv.getInt16(hhea.off + 6, false);
    const numHMetrics = Math.max(1, dv.getUint16(hhea.off + 34, false));

    let sCap = 0;
    if (tables['OS/2'] && tables['OS/2'].len >= 90) {
      const ver = dv.getUint16(tables['OS/2'].off, false);
      if (ver >= 2) sCap = dv.getInt16(tables['OS/2'].off + 88, false);
    }

    const name = readName(bytes, dv, tables.name) || opts.fallbackName || 'Eigene Schrift';
    const charToGid = parseCmap(bytes, dv, tables.cmap);
    const kernMap = parseKern(bytes, dv, tables.kern);

    function advanceWidth(gid) {
      const i = gid < numHMetrics ? gid : numHMetrics - 1;
      const p = hmtx.off + i * 4;
      if (p + 2 > hmtx.off + hmtx.len) return Math.round(em / 2);
      return dv.getUint16(p, false);
    }

    function glyphRange(gid) {
      if (gid < 0 || gid >= numGlyphs) return null;
      let o0, o1;
      if (idxFmt === 0) {
        const p = loca.off + gid * 2;
        if (p + 4 > loca.off + loca.len) return null;
        o0 = dv.getUint16(p, false) * 2;
        o1 = dv.getUint16(p + 2, false) * 2;
      } else {
        const p = loca.off + gid * 4;
        if (p + 8 > loca.off + loca.len) return null;
        o0 = dv.getUint32(p, false);
        o1 = dv.getUint32(p + 4, false);
      }
      if (o0 >= o1 || glyf.off + o1 > glyf.off + glyf.len) return null;
      return [glyf.off + o0, glyf.off + o1];
    }

    const contourCache = new Map();
    function decodeGlyph(gid, depth = 0) {
      if (depth > 8) return [];
      if (depth === 0 && contourCache.has(gid)) return contourCache.get(gid);
      const rng = glyphRange(gid);
      if (!rng) {
        if (depth === 0) contourCache.set(gid, []);
        return [];
      }
      const [gStart, gEnd] = rng;
      if (gStart + 10 > gEnd) return [];
      const nc = dv.getInt16(gStart, false);
      const out = [];

      if (nc > 0) {
        let p = gStart + 10;
        if (p + nc * 2 + 2 > gEnd) return [];
        const endPts = [];
        for (let i = 0; i < nc; i++, p += 2) endPts.push(dv.getUint16(p, false));
        const nPts = endPts[nc - 1] + 1;
        const instLen = dv.getUint16(p, false);
        p += 2 + instLen;
        if (p > gEnd) return [];

        const flags = new Uint8Array(nPts);
        for (let i = 0; i < nPts && p < gEnd;) {
          const f = bytes[p++];
          flags[i++] = f;
          if ((f & 0x08) && p < gEnd) {
            const rep = bytes[p++];
            for (let k = 0; k < rep && i < nPts; k++) flags[i++] = f;
          }
        }
        const xs = new Int32Array(nPts);
        const ys = new Int32Array(nPts);
        let x = 0;
        for (let i = 0; i < nPts; i++) {
          const f = flags[i];
          if (f & 0x02) {
            if (p >= gEnd) break;
            const d = bytes[p++];
            x += (f & 0x10) ? d : -d;
          } else if (!(f & 0x10)) {
            if (p + 2 > gEnd) break;
            x += dv.getInt16(p, false);
            p += 2;
          }
          xs[i] = x;
        }
        let y = 0;
        for (let i = 0; i < nPts; i++) {
          const f = flags[i];
          if (f & 0x04) {
            if (p >= gEnd) break;
            const d = bytes[p++];
            y += (f & 0x20) ? d : -d;
          } else if (!(f & 0x20)) {
            if (p + 2 > gEnd) break;
            y += dv.getInt16(p, false);
            p += 2;
          }
          ys[i] = y;
        }

        let start = 0;
        for (let c = 0; c < nc; c++) {
          const end = endPts[c];
          const pts = [];
          for (let i = start; i <= end; i++) pts.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) !== 0 });
          const segs = contourToSegs(pts);
          if (segs.length) out.push(segs);
          start = end + 1;
        }
      } else if (nc < 0) {
        let p = gStart + 10;
        let more = true;
        while (more && p + 4 <= gEnd) {
          const flags = dv.getUint16(p, false);
          const subGid = dv.getUint16(p + 2, false);
          p += 4;
          let dx = 0, dy = 0;
          const words = (flags & 0x01) !== 0;
          const xyVals = (flags & 0x02) !== 0;
          if (words) {
            if (p + 4 > gEnd) break;
            if (xyVals) { dx = dv.getInt16(p, false); dy = dv.getInt16(p + 2, false); }
            p += 4;
          } else {
            if (p + 2 > gEnd) break;
            if (xyVals) { dx = dv.getInt8(p); dy = dv.getInt8(p + 1); }
            p += 2;
          }
          let a = 1, b = 0, c = 0, d = 1;
          if (flags & 0x08) {
            if (p + 2 > gEnd) break;
            a = d = dv.getInt16(p, false) / 16384;
            p += 2;
          } else if (flags & 0x40) {
            if (p + 4 > gEnd) break;
            a = dv.getInt16(p, false) / 16384;
            d = dv.getInt16(p + 2, false) / 16384;
            p += 4;
          } else if (flags & 0x80) {
            if (p + 8 > gEnd) break;
            a = dv.getInt16(p, false) / 16384;
            b = dv.getInt16(p + 2, false) / 16384;
            c = dv.getInt16(p + 4, false) / 16384;
            d = dv.getInt16(p + 6, false) / 16384;
            p += 8;
          }
          const tf = (pt) => [a * pt[0] + c * pt[1] + dx, b * pt[0] + d * pt[1] + dy];
          for (const segs of decodeGlyph(subGid, depth + 1)) {
            out.push(segs.map((s) => (s.t === 'bez'
              ? { t: 'bez', a: tf(s.a), c1: tf(s.c1), c2: tf(s.c2), b: tf(s.b) }
              : { t: 'line', a: tf(s.a), b: tf(s.b) })));
          }
          more = (flags & 0x20) !== 0;
        }
      }

      if (depth === 0) contourCache.set(gid, out);
      return out;
    }

    let cap = sCap > 0 ? sCap : 0;
    if (!(cap > 0)) {
      for (const ch of ['H', 'T', 'A']) {
        const gid = charToGid(ch.codePointAt(0));
        const rng = gid ? glyphRange(gid) : null;
        if (rng && rng[0] + 10 <= rng[1]) {
          const yMax = dv.getInt16(rng[0] + 8, false);
          if (yMax > 0) { cap = yMax; break; }
        }
      }
    }
    if (!(cap > 0)) cap = em * 0.7;

    const glyphCache = new Map();
    function glyph(ch) {
      if (glyphCache.has(ch)) return glyphCache.get(ch);
      const cp = String(ch).codePointAt(0);
      if (cp == null) return null;
      const gid = charToGid(cp);
      if (!gid && ch !== ' ') { glyphCache.set(ch, null); return null; }
      const res = { w: advanceWidth(gid), contours: ch === ' ' ? [] : decodeGlyph(gid) };
      glyphCache.set(ch, res);
      return res;
    }

    function kern(ch1, ch2) {
      if (!kernMap.size || !ch1 || !ch2) return 0;
      const g1 = charToGid(String(ch1).codePointAt(0));
      const g2 = charToGid(String(ch2).codePointAt(0));
      if (!g1 || !g2) return 0;
      return kernMap.get(g1 * 65536 + g2) || 0;
    }

    return { name, em, cap, asc, desc, ttf: true, hasKern: kernMap.size > 0, kernPairs: kernMap.size, glyph, kern };
  }

  return { parse };
})();
