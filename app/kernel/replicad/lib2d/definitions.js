export function isPoint2D(point) {
    return Array.isArray(point) && point.length === 2;
}
export function isMatrix2X2(matrix) {
    return Array.isArray(matrix) && matrix.length === 2 && matrix.every((row)=>Array.isArray(row) && row.length === 2);
}
