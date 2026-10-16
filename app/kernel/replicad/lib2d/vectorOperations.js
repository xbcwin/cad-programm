
export const samePoint = ([x0, y0], [x1, y1], precision = 1e-6)=>{
    return Math.abs(x0 - x1) <= precision && Math.abs(y0 - y1) <= precision;
};
export const add2d = ([x0, y0], [x1, y1])=>{
    return [
        x0 + x1,
        y0 + y1
    ];
};
export const subtract2d = ([x0, y0], [x1, y1])=>{
    return [
        x0 - x1,
        y0 - y1
    ];
};
export const scalarMultiply2d = ([x0, y0], scalar)=>{
    return [
        x0 * scalar,
        y0 * scalar
    ];
};
export const distance2d = ([x0, y0], [x1, y1] = [
    0,
    0
])=>{
    return Math.sqrt((x0 - x1) ** 2 + (y0 - y1) ** 2);
};
export const squareDistance2d = ([x0, y0], [x1, y1] = [
    0,
    0
])=>{
    return (x0 - x1) ** 2 + (y0 - y1) ** 2;
};
export function crossProduct2d([x0, y0], [x1, y1]) {
    return x0 * y1 - y0 * x1;
}
export function dotProduct2d([x0, y0], [x1, y1]) {
    return x0 * x1 + y0 * y1;
}
export const angle2d = ([x0, y0], [x1, y1] = [
    0,
    0
])=>{
    return Math.atan2(y1 * x0 - y0 * x1, x0 * x1 + y0 * y1);
};
export const polarAngle2d = ([x0, y0], [x1, y1] = [
    0,
    0
])=>{
    return Math.atan2(y1 - y0, x1 - x0);
};
export const normalize2d = ([x0, y0])=>{
    const l = distance2d([
        x0,
        y0
    ]);
    return [
        x0 / l,
        y0 / l
    ];
};
export const rotate2d = (point, angle, center = [
    0,
    0
])=>{
    const [px0, py0] = point;
    const [cx, cy] = center;
    const px = px0 - cx;
    const py = py0 - cy;
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const xnew = px * cosA - py * sinA;
    const ynew = px * sinA + py * cosA;
    return [
        xnew + cx,
        ynew + cy
    ];
};
export const polarToCartesian = (r, theta)=>{
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r;
    return [
        x,
        y
    ];
};
export const cartesianToPolar = ([x, y])=>{
    const r = distance2d([
        x,
        y
    ]);
    const theta = Math.atan2(y, x);
    return [
        r,
        theta
    ];
};
export const determinant2x2 = (matrix)=>{
    return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
};
