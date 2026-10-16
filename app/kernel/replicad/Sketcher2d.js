import Sketch from "./sketches/Sketch.js";
import { DEG2RAD, RAD2DEG } from "./constants.js";
import { localGC } from "./register.js";
import { getOC } from "./oclib.js";
import { assembleWire } from "./shapeHelpers.js";
import { Edge } from "./shapes.js";
import { convertSvgEllipseParams, defaultsSplineConfig } from "./sketcherlib.js";

import { chamferCurves, Curve2D, dogboneFilletCurves, filletCurves } from "./lib2d/index.js";
import { normalize2d, polarAngle2d, samePoint, distance2d, axis2d, rotate2d, polarToCartesian, cartesianToPolar, make2dSegmentCurve, make2dTangentArc, make2dThreePointArc, make2dBezierCurve, make2dEllipseArc } from "./lib2d/index.js";
import Blueprint from "./blueprints/Blueprint.js";
function buildCornerFunction(radius, mode) {
    if (typeof radius === "function") return radius;
    const makeFn = mode === "chamfer" ? chamferCurves : mode === "dogbone" ? dogboneFilletCurves : filletCurves;
    return (first, second)=>makeFn(first, second, radius);
}
export class BaseSketcher2d {
    pointer;
    firstPoint;
    pendingCurves;
    _nextCorner;
    constructor(origin = [
        0,
        0
    ]){
        this.pointer = origin;
        this.firstPoint = origin;
        this._nextCorner = null;
        this.pendingCurves = [];
    }
    _convertToUV([x, y]) {
        return [
            x,
            y
        ];
    }
    _convertFromUV([u, v]) {
        return [
            u,
            v
        ];
    }
    get penPosition() {
        return this.pointer;
    }
    get penAngle() {
        if (this.pendingCurves.length === 0) return 0;
        const lastCurve = this.pendingCurves[this.pendingCurves.length - 1];
        const [dx, dy] = lastCurve.tangentAt(1);
        const angleInRadians = Math.atan2(dy, dx);
        return angleInRadians * RAD2DEG;
    }
    movePointerTo(point) {
        if (this.pendingCurves.length) throw new Error("You can only move the pointer if there is no curve defined");
        this.pointer = point;
        this.firstPoint = point;
        return this;
    }
    saveCurve(curve) {
        if (!this._nextCorner) {
            this.pendingCurves.push(curve);
            return;
        }
        const previousCurve = this.pendingCurves.pop();
        if (!previousCurve) throw new Error("bug in the custom corner algorithm");
        this.pendingCurves.push(...this._nextCorner(previousCurve, curve));
        this._nextCorner = null;
    }
    lineTo(point) {
        const curve = make2dSegmentCurve(this._convertToUV(this.pointer), this._convertToUV(point));
        this.pointer = point;
        this.saveCurve(curve);
        return this;
    }
    line(xDist, yDist) {
        return this.lineTo([
            this.pointer[0] + xDist,
            this.pointer[1] + yDist
        ]);
    }
    vLine(distance) {
        return this.line(0, distance);
    }
    hLine(distance) {
        return this.line(distance, 0);
    }
    vLineTo(yPos) {
        return this.lineTo([
            this.pointer[0],
            yPos
        ]);
    }
    hLineTo(xPos) {
        return this.lineTo([
            xPos,
            this.pointer[1]
        ]);
    }
    polarLineTo([r, theta]) {
        const angleInRads = theta * DEG2RAD;
        const point = polarToCartesian(r, angleInRads);
        return this.lineTo(point);
    }
    polarLine(distance, angle) {
        const angleInRads = angle * DEG2RAD;
        const [x, y] = polarToCartesian(distance, angleInRads);
        return this.line(x, y);
    }
    tangentLine(distance) {
        const previousCurve = this.pendingCurves.length ? this.pendingCurves[this.pendingCurves.length - 1] : null;
        if (!previousCurve) throw new Error("You need a previous curve to sketch a tangent line");
        const direction = normalize2d(this._convertFromUV(previousCurve.tangentAt(1)));
        return this.line(direction[0] * distance, direction[1] * distance);
    }
    threePointsArcTo(end, midPoint) {
        this.saveCurve(make2dThreePointArc(this._convertToUV(this.pointer), this._convertToUV(midPoint), this._convertToUV(end)));
        this.pointer = end;
        return this;
    }
    threePointsArc(xDist, yDist, viaXDist, viaYDist) {
        const [x0, y0] = this.pointer;
        return this.threePointsArcTo([
            x0 + xDist,
            y0 + yDist
        ], [
            x0 + viaXDist,
            y0 + viaYDist
        ]);
    }
    sagittaArcTo(end, sagitta) {
        const [x0, y0] = this.pointer;
        const [x1, y1] = end;
        const midPoint = [
            (x0 + x1) / 2,
            (y0 + y1) / 2
        ];
        const sagDir = [
            -(y1 - y0),
            x1 - x0
        ];
        const sagDirLen = Math.sqrt(sagDir[0] ** 2 + sagDir[1] ** 2);
        const sagPoint = [
            midPoint[0] + sagDir[0] / sagDirLen * sagitta,
            midPoint[1] + sagDir[1] / sagDirLen * sagitta
        ];
        this.saveCurve(make2dThreePointArc(this._convertToUV(this.pointer), this._convertToUV(sagPoint), this._convertToUV(end)));
        this.pointer = end;
        return this;
    }
    sagittaArc(xDist, yDist, sagitta) {
        return this.sagittaArcTo([
            xDist + this.pointer[0],
            yDist + this.pointer[1]
        ], sagitta);
    }
    vSagittaArc(distance, sagitta) {
        return this.sagittaArc(0, distance, sagitta);
    }
    hSagittaArc(distance, sagitta) {
        return this.sagittaArc(distance, 0, sagitta);
    }
    bulgeArcTo(end, bulge) {
        if (!bulge) return this.lineTo(end);
        const halfChord = distance2d(this.pointer, end) / 2;
        const bulgeAsSagitta = -bulge * halfChord;
        return this.sagittaArcTo(end, bulgeAsSagitta);
    }
    bulgeArc(xDist, yDist, bulge) {
        return this.bulgeArcTo([
            xDist + this.pointer[0],
            yDist + this.pointer[1]
        ], bulge);
    }
    vBulgeArc(distance, bulge) {
        return this.bulgeArc(0, distance, bulge);
    }
    hBulgeArc(distance, bulge) {
        return this.bulgeArc(distance, 0, bulge);
    }
    tangentArcTo(end) {
        const previousCurve = this.pendingCurves.length ? this.pendingCurves[this.pendingCurves.length - 1] : null;
        if (!previousCurve) throw new Error("You need a previous curve to sketch a tangent arc");
        this.saveCurve(make2dTangentArc(this._convertToUV(this.pointer), previousCurve.tangentAt(1), this._convertToUV(end)));
        this.pointer = end;
        return this;
    }
    tangentArc(xDist, yDist) {
        const [x0, y0] = this.pointer;
        return this.tangentArcTo([
            xDist + x0,
            yDist + y0
        ]);
    }
    ellipseTo(end, horizontalRadius, verticalRadius, rotation = 0, longAxis = false, sweep = false) {
        let rotationAngle = rotation;
        let majorRadius = horizontalRadius;
        let minorRadius = verticalRadius;
        if (horizontalRadius < verticalRadius) {
            rotationAngle = rotation + 90;
            majorRadius = verticalRadius;
            minorRadius = horizontalRadius;
        }
        const radRotationAngle = rotationAngle * DEG2RAD;
        const convertAxis = (ax)=>distance2d(this._convertToUV(ax));
        const r1 = convertAxis(polarToCartesian(majorRadius, radRotationAngle));
        const r2 = convertAxis(polarToCartesian(minorRadius, radRotationAngle + Math.PI / 2));
        const xDir = normalize2d(this._convertToUV(rotate2d([
            1,
            0
        ], radRotationAngle)));
        const [, newRotationAngle] = cartesianToPolar(xDir);
        const { cx, cy, startAngle, endAngle, clockwise, rx, ry } = convertSvgEllipseParams(this._convertToUV(this.pointer), this._convertToUV(end), r1, r2, newRotationAngle, longAxis, sweep);
        const arc = make2dEllipseArc(rx, ry, clockwise ? startAngle : endAngle, clockwise ? endAngle : startAngle, [
            cx,
            cy
        ], xDir);
        if (!clockwise) {
            arc.reverse();
        }
        this.saveCurve(arc);
        this.pointer = end;
        return this;
    }
    ellipse(xDist, yDist, horizontalRadius, verticalRadius, rotation = 0, longAxis = false, sweep = false) {
        const [x0, y0] = this.pointer;
        return this.ellipseTo([
            xDist + x0,
            yDist + y0
        ], horizontalRadius, verticalRadius, rotation, longAxis, sweep);
    }
    halfEllipseTo(end, minorRadius, sweep = false) {
        const angle = polarAngle2d(end, this.pointer);
        const distance = distance2d(end, this.pointer);
        return this.ellipseTo(end, distance / 2, minorRadius, angle * RAD2DEG, true, sweep);
    }
    halfEllipse(xDist, yDist, minorRadius, sweep = false) {
        const [x0, y0] = this.pointer;
        return this.halfEllipseTo([
            x0 + xDist,
            y0 + yDist
        ], minorRadius, sweep);
    }
    bezierCurveTo(end, controlPoints) {
        let cp;
        if (controlPoints.length === 2 && !Array.isArray(controlPoints[0])) {
            cp = [
                controlPoints
            ];
        } else {
            cp = controlPoints;
        }
        this.saveCurve(make2dBezierCurve(this._convertToUV(this.pointer), cp.map((point)=>this._convertToUV(point)), this._convertToUV(end)));
        this.pointer = end;
        return this;
    }
    quadraticBezierCurveTo(end, controlPoint) {
        return this.bezierCurveTo(end, [
            controlPoint
        ]);
    }
    cubicBezierCurveTo(end, startControlPoint, endControlPoint) {
        return this.bezierCurveTo(end, [
            startControlPoint,
            endControlPoint
        ]);
    }
    smoothSplineTo(end, config) {
        const { endTangent, startTangent, startFactor, endFactor } = defaultsSplineConfig(config);
        const previousCurve = this.pendingCurves.length ? this.pendingCurves[this.pendingCurves.length - 1] : null;
        const defaultDistance = distance2d(this.pointer, end) * 0.25;
        let startPoleDirection;
        if (startTangent) {
            startPoleDirection = startTangent;
        } else if (!previousCurve) {
            startPoleDirection = [
                1,
                0
            ];
        } else {
            startPoleDirection = this._convertFromUV(previousCurve.tangentAt(1));
        }
        startPoleDirection = normalize2d(startPoleDirection);
        const startControl = [
            this.pointer[0] + startPoleDirection[0] * startFactor * defaultDistance,
            this.pointer[1] + startPoleDirection[1] * startFactor * defaultDistance
        ];
        let endPoleDirection;
        if (endTangent === "symmetric") {
            endPoleDirection = [
                -startPoleDirection[0],
                -startPoleDirection[1]
            ];
        } else {
            endPoleDirection = endTangent;
        }
        endPoleDirection = normalize2d(endPoleDirection);
        const endControl = [
            end[0] - endPoleDirection[0] * endFactor * defaultDistance,
            end[1] - endPoleDirection[1] * endFactor * defaultDistance
        ];
        return this.cubicBezierCurveTo(end, startControl, endControl);
    }
    smoothSpline(xDist, yDist, splineConfig) {
        return this.smoothSplineTo([
            xDist + this.pointer[0],
            yDist + this.pointer[1]
        ], splineConfig);
    }
    customCorner(radius, mode = "fillet") {
        if (!this.pendingCurves.length) throw new Error("You need a curve defined to fillet the angle");
        this._nextCorner = buildCornerFunction(radius, mode);
        return this;
    }
    _customCornerLastWithFirst(radius, mode = "fillet") {
        if (!radius) return;
        const previousCurve = this.pendingCurves.pop();
        const curve = this.pendingCurves.shift();
        if (!previousCurve || !curve) throw new Error("Not enough curves to close and fillet");
        this.pendingCurves.push(...buildCornerFunction(radius, mode)(previousCurve, curve));
    }
    _closeSketch() {
        if (!samePoint(this.pointer, this.firstPoint)) {
            this.lineTo(this.firstPoint);
        }
    }
    _closeWithMirror() {
        if (samePoint(this.pointer, this.firstPoint)) throw new Error("Cannot close with a mirror when the sketch is already closed");
        const startToEndVector = [
            this.pointer[0] - this.firstPoint[0],
            this.pointer[1] - this.firstPoint[1]
        ];
        const mirrorAxis = axis2d(this._convertToUV(this.pointer), this._convertToUV(startToEndVector));
        const mirroredCurves = this.pendingCurves.map((c)=>new Curve2D(c.innerCurve.Mirrored(mirrorAxis)));
        mirroredCurves.reverse();
        mirroredCurves.map((c)=>c.reverse());
        this.pendingCurves.push(...mirroredCurves);
        this.pointer = this.firstPoint;
    }
}
export default class FaceSketcher extends BaseSketcher2d {
    face;
    _bounds;
    constructor(face, origin = [
        0,
        0
    ]){
        super(origin);
        this.face = face.clone();
        this._bounds = face.UVBounds;
    }
    _convertToUV([x, y]) {
        const { uMin, uMax, vMin, vMax } = this._bounds;
        return [
            uMin + x * (uMax - uMin),
            vMin + y * (vMax - vMin)
        ];
    }
    _convertFromUV([u, v]) {
        const { uMin, uMax, vMin, vMax } = this._bounds;
        return [
            (u - uMin) / (uMax - uMin),
            (v - vMin) / (vMax - vMin)
        ];
    }
    _adaptSurface() {
        const oc = getOC();
        return oc.BRep_Tool.Surface(this.face.wrapped);
    }
    buildWire() {
        const [r, gc] = localGC();
        const oc = getOC();
        const geomSurf = r(this._adaptSurface());
        const edges = this.pendingCurves.map((curve)=>{
            return r(new Edge(r(new oc.BRepBuilderAPI_MakeEdge(curve.wrapped, geomSurf)).Edge()));
        });
        const wire = assembleWire(edges);
        oc.BRepLib.BuildCurves3d(wire.wrapped);
        gc();
        return wire;
    }
    done() {
        const [r, gc] = localGC();
        const wire = this.buildWire();
        const sketch = new Sketch(wire);
        if (wire.isClosed) {
            const face = r(sketch.clone().face());
            sketch.defaultOrigin = r(face.pointOnSurface(0.5, 0.5));
            sketch.defaultDirection = r(r(face.normalAt()).multiply(-1));
        } else {
            const startPoint = r(wire.startPoint);
            sketch.defaultOrigin = startPoint;
            sketch.defaultDirection = r(this.face.normalAt(startPoint));
        }
        sketch.baseFace = this.face;
        gc();
        return sketch;
    }
    close() {
        this._closeSketch();
        return this.done();
    }
    closeWithMirror() {
        this._closeWithMirror();
        return this.close();
    }
    closeWithCustomCorner(radius, mode = "fillet") {
        this._closeSketch();
        this._customCornerLastWithFirst(radius, mode);
        return this.done();
    }
}
export class BlueprintSketcher extends BaseSketcher2d {
    constructor(origin = [
        0,
        0
    ]){
        super();
        this.pointer = origin;
        this.firstPoint = origin;
        this.pendingCurves = [];
    }
    done() {
        return new Blueprint(this.pendingCurves);
    }
    close() {
        this._closeSketch();
        return this.done();
    }
    closeWithMirror() {
        this._closeWithMirror();
        return this.close();
    }
    closeWithCustomCorner(radius, mode = "fillet") {
        this._closeSketch();
        this._customCornerLastWithFirst(radius, mode);
        return this.done();
    }
}
