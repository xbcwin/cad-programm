import { DEG2RAD } from "./constants.js";
import { polarToCartesian } from "./lib2d/index.js";
const isTangent = (c)=>c === "symmetric" || typeof c === "number" || Array.isArray(c) && c.length === 2;
export const defaultsSplineConfig = (config)=>{
    let conf;
    if (!config) conf = {
        endTangent: [
            1,
            0
        ]
    };
    else if (isTangent(config)) {
        conf = {
            endTangent: config
        };
    } else {
        conf = {
            endTangent: 0,
            ...config
        };
    }
    const { endTangent: endTgt, startFactor = 1, endFactor = 1, startTangent: startTgt } = conf;
    let endTangent;
    if (typeof endTgt === "number") {
        endTangent = polarToCartesian(1, endTgt * DEG2RAD);
    } else {
        endTangent = endTgt;
    }
    let startTangent;
    if (typeof startTgt === "number") {
        startTangent = polarToCartesian(1, startTgt * DEG2RAD);
    } else {
        startTangent = startTgt;
    }
    return {
        endTangent,
        startFactor,
        endFactor,
        startTangent
    };
};
function radianAngle(ux, uy, vx, vy) {
    const dot = ux * vx + uy * vy;
    const mod = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let rad = Math.acos(dot / mod);
    if (ux * vy - uy * vx < 0.0) {
        rad = -rad;
    }
    return rad;
}
export function convertSvgEllipseParams([x1, y1], [x2, y2], rx, ry, phi, fA, fS) {
    const PIx2 = Math.PI * 2.0;
    if (rx < 0) {
        rx = -rx;
    }
    if (ry < 0) {
        ry = -ry;
    }
    if (rx == 0.0 || ry == 0.0) {
        throw Error("rx and ry can not be 0");
    }
    const s_phi = Math.sin(phi);
    const c_phi = Math.cos(phi);
    const hd_x = (x1 - x2) / 2.0;
    const hd_y = (y1 - y2) / 2.0;
    const hs_x = (x1 + x2) / 2.0;
    const hs_y = (y1 + y2) / 2.0;
    const x1_ = c_phi * hd_x + s_phi * hd_y;
    const y1_ = c_phi * hd_y - s_phi * hd_x;
    const lambda = x1_ * x1_ / (rx * rx) + y1_ * y1_ / (ry * ry);
    if (lambda > 1) {
        rx = rx * Math.sqrt(lambda);
        ry = ry * Math.sqrt(lambda);
    }
    const rxry = rx * ry;
    const rxy1_ = rx * y1_;
    const ryx1_ = ry * x1_;
    const sum_of_sq = rxy1_ * rxy1_ + ryx1_ * ryx1_;
    if (!sum_of_sq) {
        throw Error("start point can not be same as end point");
    }
    let coe = Math.sqrt(Math.abs((rxry * rxry - sum_of_sq) / sum_of_sq));
    if (fA == fS) {
        coe = -coe;
    }
    const cx_ = coe * rxy1_ / ry;
    const cy_ = -coe * ryx1_ / rx;
    const cx = c_phi * cx_ - s_phi * cy_ + hs_x;
    const cy = s_phi * cx_ + c_phi * cy_ + hs_y;
    const xcr1 = (x1_ - cx_) / rx;
    const xcr2 = (x1_ + cx_) / rx;
    const ycr1 = (y1_ - cy_) / ry;
    const ycr2 = (y1_ + cy_) / ry;
    const startAngle = radianAngle(1.0, 0.0, xcr1, ycr1);
    let deltaAngle = radianAngle(xcr1, ycr1, -xcr2, -ycr2);
    while(deltaAngle > PIx2){
        deltaAngle -= PIx2;
    }
    while(deltaAngle < 0.0){
        deltaAngle += PIx2;
    }
    if (!fS) {
        deltaAngle -= PIx2;
    }
    let endAngle = startAngle + deltaAngle;
    while(endAngle > PIx2){
        endAngle -= PIx2;
    }
    while(endAngle < 0.0){
        endAngle += PIx2;
    }
    const outputObj = {
        cx: cx,
        cy: cy,
        startAngle: startAngle,
        deltaAngle: deltaAngle,
        endAngle: endAngle,
        clockwise: !!fS,
        rx,
        ry
    };
    return outputObj;
}
