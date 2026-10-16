export default class Flatbush {
  constructor(n) { this._b = []; }
  add(a, b, c = a, d = b) { this._b.push([a, b, c, d]); return this._b.length - 1; }
  finish() {}
  search(a, b, c, d, f) { const o = []; for (let i = 0; i < this._b.length; i++) { const x = this._b[i]; if (x[2] < a || x[3] < b || x[0] > c || x[1] > d) continue; if (!f || f(i)) o.push(i); } return o; }
}
