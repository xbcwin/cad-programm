// ================= Bauteil-Bibliothek (Definitionen für die Oberfläche) =================
const SIZES = ['M1.6', 'M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8'];
const LIB = [
  { lib: 'screwHole', label: 'Schraubenloch', role: 'hole', icon: 'bolt', desc: 'Durchgangsloch mit Senkung für Schrauben', params: [
    { k: 'size', label: 'Schraube', type: 'select', options: SIZES, def: 'M3' },
    { k: 'head', label: 'Kopf', type: 'select', options: [['countersunk', 'Senkkopf'], ['counterbore', 'Zylinderkopf'], ['none', 'ohne Senkung']], def: 'countersunk' },
    { k: 'fit', label: 'Loch', type: 'select', options: [['medium', 'Mittel (Standard)'], ['fine', 'Eng (genau)'], ['coarse', 'Weit (mit Spiel)'], ['tap', 'Kernloch für Gewinde']], def: 'medium' },
    { k: 'length', label: 'Tiefe', type: 'num', def: 10 },
  ] },
  { lib: 'nutTrap', label: 'Mutternfalle', role: 'hole', icon: 'hex', desc: 'Sechskant-Tasche für eine Mutter, mit Schraubenloch', params: [
    { k: 'size', label: 'Mutter', type: 'select', options: SIZES, def: 'M3' },
    { k: 'depth', label: 'Taschentiefe', type: 'num', def: null, auto: true },
    { k: 'length', label: 'Lochtiefe', type: 'num', def: 12 },
  ] },
  { lib: 'insert', label: 'Gewindeeinsatz', role: 'hole', icon: 'target', desc: 'Loch für einen Einschmelz-Gewindeeinsatz', params: [
    { k: 'size', label: 'Gewinde', type: 'select', options: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8'], def: 'M3' },
    { k: 'depth', label: 'Tiefe', type: 'num', def: null, auto: true },
  ] },
  { lib: 'slotHole', label: 'Langloch', role: 'hole', icon: 'slot', desc: 'Längliches Loch zum Verstellen', params: [
    { k: 'len', label: 'Länge', type: 'num', def: 20 }, { k: 'w', label: 'Breite', type: 'num', def: 4.5 }, { k: 'depth', label: 'Tiefe', type: 'num', def: 10 },
  ] },
  { lib: 'snapHook', label: 'Schnapphaken', role: 'solid', icon: 'snap', desc: 'Federnder Haken zum Einrasten', params: [
    { k: 'length', label: 'Länge', type: 'num', def: 12 }, { k: 'w', label: 'Breite', type: 'num', def: 8 }, { k: 't', label: 'Dicke', type: 'num', def: 1.6 }, { k: 'hook', label: 'Hakentiefe', type: 'num', def: 1.2 },
  ] },
  { lib: 'hinge', label: 'Scharnier', role: 'solid', icon: 'hinge', desc: 'Scharnier mit Spiel, aus einem Stück', params: [
    { k: 'len', label: 'Länge', type: 'num', def: 40 }, { k: 'w', label: 'Flügelbreite', type: 'num', def: 15 }, { k: 't', label: 'Dicke', type: 'num', def: 2.4 }, { k: 'gap', label: 'Spiel', type: 'num', def: 0.4 },
  ] },
  { lib: 'gear', label: 'Zahnrad', role: 'solid', icon: 'gear', desc: 'Stirnrad mit Evolventen-Zähnen', params: [
    { k: 'teeth', label: 'Zähne', type: 'num', def: 20, int: true, unit: '' }, { k: 'module', label: 'Modul', type: 'num', def: 1.5 }, { k: 'h', label: 'Dicke', type: 'num', def: 6 }, { k: 'bore', label: 'Bohrung Ø', type: 'num', def: 5 },
  ] },
];
const LIBMAP = Object.fromEntries(LIB.map((d) => [d.lib, d]));
function libDefaults(def) { const p = {}; for (const q of def.params) p[q.k] = q.def; return p; }

// kleine Vorschaubilder der Grundkörper (isometrisch)
function primitiveSVG(kind) {
  const A = 'var(--accent)', ink = 'var(--ink)';
  const f = (op) => `fill="${A}" fill-opacity="${op}"`;
  const st = `stroke="${ink}" stroke-opacity=".55" stroke-width="1.3" stroke-linejoin="round"`;
  const W = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
  switch (kind) {
    case 'box': return W(`<path d="M24 8 40 16 24 24 8 16z" ${f(0.35)} ${st}/><path d="M8 16 24 24v17L8 33z" ${f(0.62)} ${st}/><path d="M40 16 24 24v17l16-8z" ${f(0.85)} ${st}/>`);
    case 'cylinder': return W(`<path d="M9 13v21c0 3.3 6.7 6 15 6s15-2.7 15-6V13" ${f(0.7)} ${st}/><ellipse cx="24" cy="13" rx="15" ry="6" ${f(0.35)} ${st}/>`);
    case 'sphere': return W(`<defs><radialGradient id="gs" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".45" stop-color="${A}" stop-opacity=".55"/><stop offset="1" stop-color="${A}" stop-opacity=".95"/></radialGradient></defs><circle cx="24" cy="24" r="16" fill="url(#gs)" ${st}/>`);
    case 'hemisphere': return W(`<path d="M8 30a16 16 0 0 1 32 0" ${f(0.7)} ${st}/><ellipse cx="24" cy="30" rx="16" ry="5.5" ${f(0.4)} ${st}/>`);
    case 'cone': return W(`<path d="M24 6 9 34c0 3.3 6.7 6 15 6s15-2.7 15-6z" ${f(0.7)} ${st}/><path d="M9 34c0-3.3 6.7-6 15-6s15 2.7 15 6" fill="none" ${st} stroke-dasharray="2 2"/>`);
    case 'pyramid': return W(`<path d="M24 7 8 30l16 9z" ${f(0.62)} ${st}/><path d="M24 7 40 30l-16 9z" ${f(0.85)} ${st}/>`);
    case 'wedge': return W(`<path d="M8 20 24 12v10L8 30z" ${f(0.35)} ${st}/><path d="M8 20v18l16 8V22z" ${f(0.62)} ${st}/><path d="M24 22v24l16-8z" ${f(0.85)} ${st}/><path d="M24 12l16 26" ${st} fill="none"/>`);
    case 'tube': return W(`<path d="M9 13v21c0 3.3 6.7 6 15 6s15-2.7 15-6V13" ${f(0.7)} ${st}/><ellipse cx="24" cy="13" rx="15" ry="6" ${f(0.35)} ${st}/><ellipse cx="24" cy="13" rx="9" ry="3.6" fill="var(--surface)" ${st}/>`);
    case 'torus': return W(`<ellipse cx="24" cy="25" rx="18" ry="11" ${f(0.75)} ${st}/><ellipse cx="24" cy="23" rx="8.5" ry="4.2" fill="var(--surface)" ${st}/>`);
    case 'prism': return W(`<path d="M15 10h18l6 5-6 5H15l-6-5z" ${f(0.35)} ${st}/><path d="M9 15v18l6 5V20z" ${f(0.55)} ${st}/><path d="M15 20v18h18V20z" ${f(0.72)} ${st}/><path d="M33 20v18l6-5V15z" ${f(0.88)} ${st}/>`);
  }
  return W(`<rect x="10" y="10" width="28" height="28" rx="4" ${f(0.6)} ${st}/>`);
}
function partSVG(def) {
  const col = def.role === 'hole' ? 'var(--hole)' : 'var(--accent)';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[def.icon] || IC.parts}</svg>`;
}

