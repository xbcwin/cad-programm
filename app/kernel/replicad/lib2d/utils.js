import round2 from "../utils/round2.js";

export const reprPnt = ([x, y])=>{
    return `(${round2(x)},${round2(y)})`;
};
const asFixed = (p, precision = 1e-9)=>{
    let num = p;
    if (Math.abs(p) < precision) num = 0;
    return num.toFixed(-Math.log10(precision));
};
export const removeDuplicatePoints = (points, precision = 1e-9)=>{
    return Array.from(new Map(points.map(([p0, p1])=>[
            `[${asFixed(p0, precision)},${asFixed(p1, precision)}]`,
            [
                p0,
                p1
            ]
        ])).values());
};
