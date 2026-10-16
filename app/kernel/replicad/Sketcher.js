import { Plane, Vector } from "./geom.js";
import { makePlane } from "./geomHelpers.js";
import { localGC } from "./register.js";
import { DEG2RAD, RAD2DEG } from "./constants.js";
import { distance2d, polarAngle2d, polarToCartesian } from "./lib2d/index.js";
import { makeLine, makeThreePointArc, makeBezierCurve, makeTangentArc, makeEllipseArc, assembleWire } from "./shapeHelpers.js";
import { convertSvgEllipseParams, defaultsSplineConfig } from "./sketcherlib.js";


import Sketch from "./sketches/Sketch.js";
export default class Sketcher {
    plane;
    pointer;
    firstPoint;
    pendingEdges;
    _mirrorWire;
    constructor(plane, origin){
        this.plane = plane instanceof Plane ? makePlane(plane) : makePlane(plane, origin);
        this.pointer = new Vector(this.plane.origin);
        this.firstPoint = new Vector(this.plane.origin);
        this.pendingEdges = [];
        this._mirrorWire = false;
    }
    delete() {
        this.plane.delete();
    }
    _updatePointer(newPointer) {
        this.pointer = newPointer;
    }
    movePointerTo([x, y]) {
        if (this.pendingEdges.length) throw new Error("You can only move the pointer if there is no edge defined");
        this._updatePointer(this.plane.toWorldCoords([
            x,
            y
        ]));
        this.firstPoint = new Vector(this.pointer);
        return this;
    }
    lineTo([x, y]) {
        const endPoint = this.plane.toWorldCoords([
            x,
            y
        ]);
        this.pendingEdges.push(makeLine(this.pointer, endPoint));
        this._updatePointer(endPoint);
        return this;
    }
    line(xDist, yDist) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.lineTo([
            xDist + pointer.x,
            yDist + pointer.y
        ]);
    }
    vLine(distance) {
        return this.line(0, distance);
    }
    hLine(distance) {
        return this.line(distance, 0);
    }
    vLineTo(yPos) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.lineTo([
            pointer.x,
            yPos
        ]);
    }
    hLineTo(xPos) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.lineTo([
            xPos,
            pointer.y
        ]);
    }
    polarLine(distance, angle) {
        const angleInRads = angle * DEG2RAD;
        const [x, y] = polarToCartesian(distance, angleInRads);
        return this.line(x, y);
    }
    polarLineTo([r, theta]) {
        const angleInRads = theta * DEG2RAD;
        const point = polarToCartesian(r, angleInRads);
        return this.lineTo(point);
    }
    tangentLine(distance) {
        const [r, gc] = localGC();
        const previousEdge = this.pendingEdges.length ? this.pendingEdges[this.pendingEdges.length - 1] : null;
        if (!previousEdge) throw new Error("you need a previous edge to create a tangent line");
        const tangent = r(previousEdge.tangentAt(1));
        const endPoint = r(tangent.normalized().multiply(distance)).add(this.pointer);
        this.pendingEdges.push(makeLine(this.pointer, endPoint));
        this._updatePointer(endPoint);
        gc();
        return this;
    }
    threePointsArcTo(end, innerPoint) {
        const gpoint1 = this.plane.toWorldCoords(innerPoint);
        const gpoint2 = this.plane.toWorldCoords(end);
        this.pendingEdges.push(makeThreePointArc(this.pointer, gpoint1, gpoint2));
        this._updatePointer(gpoint2);
        return this;
    }
    threePointsArc(xDist, yDist, viaXDist, viaYDist) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.threePointsArcTo([
            pointer.x + xDist,
            pointer.y + yDist
        ], [
            pointer.x + viaXDist,
            pointer.y + viaYDist
        ]);
    }
    tangentArcTo(end) {
        const endPoint = this.plane.toWorldCoords(end);
        const previousEdge = this.pendingEdges[this.pendingEdges.length - 1];
        this.pendingEdges.push(makeTangentArc(previousEdge.endPoint, previousEdge.tangentAt(1), endPoint));
        this._updatePointer(endPoint);
        return this;
    }
    tangentArc(xDist, yDist) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.tangentArcTo([
            xDist + pointer.x,
            yDist + pointer.y
        ]);
    }
    sagittaArcTo(end, sagitta) {
        const startPoint = this.pointer;
        const endPoint = this.plane.toWorldCoords(end);
        let p = endPoint.add(startPoint);
        const midPoint = p.multiply(0.5);
        p = endPoint.sub(startPoint);
        const sagDirection = p.cross(this.plane.zDir).normalized();
        const sagVector = sagDirection.multiply(sagitta);
        const sagPoint = midPoint.add(sagVector);
        this.pendingEdges.push(makeThreePointArc(this.pointer, sagPoint, endPoint));
        this._updatePointer(endPoint);
        return this;
    }
    sagittaArc(xDist, yDist, sagitta) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.sagittaArcTo([
            xDist + pointer.x,
            yDist + pointer.y
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
        const pointer = this.plane.toLocalCoords(this.pointer);
        const halfChord = distance2d([
            pointer.x,
            pointer.y
        ], end) / 2;
        const bulgeAsSagitta = -bulge * halfChord;
        return this.sagittaArcTo(end, bulgeAsSagitta);
    }
    bulgeArc(xDist, yDist, bulge) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.bulgeArcTo([
            xDist + pointer.x,
            yDist + this.pointer.y
        ], bulge);
    }
    vBulgeArc(distance, bulge) {
        return this.bulgeArc(0, distance, bulge);
    }
    hBulgeArc(distance, bulge) {
        return this.bulgeArc(distance, 0, bulge);
    }
    ellipseTo(end, horizontalRadius, verticalRadius, rotation = 0, longAxis = false, sweep = false) {
        const [r, gc] = localGC();
        const start = this.plane.toLocalCoords(this.pointer);
        let rotationAngle = rotation;
        let majorRadius = horizontalRadius;
        let minorRadius = verticalRadius;
        if (horizontalRadius < verticalRadius) {
            rotationAngle = rotation + 90;
            majorRadius = verticalRadius;
            minorRadius = horizontalRadius;
        }
        const { cx, cy, rx, ry, startAngle, endAngle, clockwise } = convertSvgEllipseParams([
            start.x,
            start.y
        ], end, majorRadius, minorRadius, rotationAngle * DEG2RAD, longAxis, sweep);
        const xDir = r(new Vector(this.plane.xDir).rotate(rotationAngle, this.plane.origin, this.plane.zDir));
        const arc = makeEllipseArc(rx, ry, clockwise ? startAngle : endAngle, clockwise ? endAngle : startAngle, r(this.plane.toWorldCoords([
            cx,
            cy
        ])), this.plane.zDir, xDir);
        if (!clockwise) {
            arc.wrapped.Reverse();
        }
        this.pendingEdges.push(arc);
        this._updatePointer(this.plane.toWorldCoords(end));
        gc();
        return this;
    }
    ellipse(xDist, yDist, horizontalRadius, verticalRadius, rotation = 0, longAxis = false, sweep = false) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.ellipseTo([
            xDist + pointer.x,
            yDist + pointer.y
        ], horizontalRadius, verticalRadius, rotation, longAxis, sweep);
    }
    halfEllipseTo(end, verticalRadius, sweep = false) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        const start = [
            pointer.x,
            pointer.y
        ];
        const angle = polarAngle2d(end, start);
        const distance = distance2d(end, start);
        return this.ellipseTo(end, distance / 2, verticalRadius, angle * RAD2DEG, false, sweep);
    }
    halfEllipse(xDist, yDist, verticalRadius, sweep = false) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.halfEllipseTo([
            xDist + pointer.x,
            yDist + pointer.y
        ], verticalRadius, sweep);
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
        const inWorldPoints = cp.map((p)=>this.plane.toWorldCoords(p));
        const endPoint = this.plane.toWorldCoords(end);
        this.pendingEdges.push(makeBezierCurve([
            this.pointer,
            ...inWorldPoints,
            endPoint
        ]));
        this._updatePointer(endPoint);
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
        const [r, gc] = localGC();
        const { endTangent, startTangent, startFactor, endFactor } = defaultsSplineConfig(config);
        const endPoint = this.plane.toWorldCoords(end);
        const previousEdge = this.pendingEdges.length ? this.pendingEdges[this.pendingEdges.length - 1] : null;
        const defaultDistance = r(endPoint.sub(this.pointer)).Length * 0.25;
        let startPoleDirection;
        if (startTangent) {
            startPoleDirection = this.plane.toWorldCoords(startTangent);
        } else if (!previousEdge) {
            startPoleDirection = this.plane.toWorldCoords([
                1,
                0
            ]);
        } else if (previousEdge.geomType === "BEZIER_CURVE") {
            const rawCurve = r(previousEdge.curve).wrapped.Bezier();
            const previousPole = r(new Vector(rawCurve.Pole(rawCurve.NbPoles() - 1)));
            startPoleDirection = r(this.pointer.sub(previousPole));
        } else {
            startPoleDirection = r(previousEdge.tangentAt(1));
        }
        const poleDistance = r(startPoleDirection.normalized().multiply(startFactor * defaultDistance));
        const startControl = r(this.pointer.add(poleDistance));
        let endPoleDirection;
        if (endTangent === "symmetric") {
            endPoleDirection = r(startPoleDirection.multiply(-1));
        } else {
            endPoleDirection = r(this.plane.toWorldCoords(endTangent));
        }
        const endPoleDistance = r(endPoleDirection.normalized().multiply(endFactor * defaultDistance));
        const endControl = r(endPoint.sub(endPoleDistance));
        this.pendingEdges.push(makeBezierCurve([
            this.pointer,
            startControl,
            endControl,
            endPoint
        ]));
        this._updatePointer(endPoint);
        gc();
        return this;
    }
    smoothSpline(xDist, yDist, splineConfig = {}) {
        const pointer = this.plane.toLocalCoords(this.pointer);
        return this.smoothSplineTo([
            xDist + pointer.x,
            yDist + pointer.y
        ], splineConfig);
    }
    _mirrorWireOnStartEnd(wire) {
        const startToEndVector = this.pointer.sub(this.firstPoint).normalize();
        const normal = startToEndVector.cross(this.plane.zDir);
        const mirroredWire = wire.clone().mirror(normal, this.pointer);
        const combinedWire = assembleWire([
            wire,
            mirroredWire
        ]);
        return combinedWire;
    }
    buildWire() {
        if (!this.pendingEdges.length) throw new Error("No lines to convert into a wire");
        let wire = assembleWire(this.pendingEdges);
        if (this._mirrorWire) {
            wire = this._mirrorWireOnStartEnd(wire);
        }
        return wire;
    }
    _closeSketch() {
        if (!this.pointer.equals(this.firstPoint) && !this._mirrorWire) {
            const endpoint = this.plane.toLocalCoords(this.firstPoint);
            this.lineTo([
                endpoint.x,
                endpoint.y
            ]);
        }
    }
    done() {
        const sketch = new Sketch(this.buildWire(), {
            defaultOrigin: this.plane.origin,
            defaultDirection: this.plane.zDir
        });
        return sketch;
    }
    close() {
        this._closeSketch();
        return this.done();
    }
    closeWithMirror() {
        this._mirrorWire = true;
        return this.close();
    }
}
