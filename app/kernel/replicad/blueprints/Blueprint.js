import { makePlane } from "../geomHelpers.js";
import { curvesAsEdgesOnFace, curvesAsEdgesOnPlane, curvesBoundingBox, mirrorTransform2d, rotateTransform2d, stretchTransform2d, scaleTransform2d, translationTransform2d } from "../curves.js";
import { adaptedCurveToPathElem, make2dSegmentCurve, samePoint, isPoint2D, approximateAsSvgCompatibleCurve } from "../lib2d/index.js";
import { assembleWire } from "../shapeHelpers.js";
import { cast } from "../shapes.js";
import Sketch from "../sketches/Sketch.js";
import { getOC } from "../oclib.js";
import { Plane } from "../geom.js";
import { DEG2RAD } from "../constants.js";

import round5 from "../utils/round5.js";
import { asSVG, viewbox } from "./svg.js";
import { GCWithScope } from "../register.js";
import { getSingleFace } from "../finders/index.js";
export default class Blueprint {
    curves;
    _boundingBox;
    _orientation;
    _guessedOrientation;
    constructor(curves){
        this.curves = curves;
        this._boundingBox = null;
        this._orientation = null;
        this._guessedOrientation = null;
    }
    delete() {
        this.curves.forEach((c)=>c.delete());
        if (this._boundingBox) this._boundingBox.delete();
    }
    clone() {
        return new Blueprint(this.curves);
    }
    get repr() {
        return [
            "Blueprint",
            ...this.curves.map((c)=>c.repr)
        ].join("\n");
    }
    get boundingBox() {
        if (!this._boundingBox) {
            this._boundingBox = curvesBoundingBox(this.curves);
        }
        return this._boundingBox;
    }
    get orientation() {
        if (this._orientation) return this._orientation;
        if (this._guessedOrientation) return this._guessedOrientation;
        const vertices = this.curves.flatMap((c)=>{
            if (c.geomType !== "LINE") {
                return [
                    c.firstPoint,
                    c.value(0.5)
                ];
            }
            return [
                c.firstPoint
            ];
        });
        const approximateArea = vertices.map((v1, i)=>{
            const v2 = vertices[(i + 1) % vertices.length];
            return (v2[0] - v1[0]) * (v2[1] + v1[1]);
        }).reduce((a, b)=>a + b, 0);
        this._guessedOrientation = approximateArea > 0 ? "clockwise" : "counterClockwise";
        return this._guessedOrientation;
    }
    stretch(ratio, direction, origin = [
        0,
        0
    ]) {
        const curves = stretchTransform2d(ratio, direction, origin).transformCurves(this.curves);
        return new Blueprint(curves);
    }
    scale(scaleFactor, center) {
        const centerPoint = center || this.boundingBox.center;
        const curves = scaleTransform2d(scaleFactor, centerPoint).transformCurves(this.curves);
        return new Blueprint(curves);
    }
    rotate(angle, center) {
        const curves = rotateTransform2d(angle * DEG2RAD, center).transformCurves(this.curves);
        return new Blueprint(curves);
    }
    translate(xDistOrPoint, yDist = 0) {
        const translationVector = isPoint2D(xDistOrPoint) ? xDistOrPoint : [
            xDistOrPoint,
            yDist
        ];
        const curves = translationTransform2d(translationVector).transformCurves(this.curves);
        return new Blueprint(curves);
    }
    mirror(centerOrDirection, origin = [
        0,
        0
    ], mode = "center") {
        const curves = mirrorTransform2d(centerOrDirection, origin, mode).transformCurves(this.curves);
        return new Blueprint(curves);
    }
    sketchOnPlane(inputPlane, origin) {
        const plane = inputPlane instanceof Plane ? makePlane(inputPlane) : makePlane(inputPlane, origin);
        const edges = curvesAsEdgesOnPlane(this.curves, plane);
        const wire = assembleWire(edges);
        return new Sketch(wire, {
            defaultOrigin: plane.origin,
            defaultDirection: plane.zDir
        });
    }
    sketchOnFace(face, scaleMode) {
        const oc = getOC();
        const edges = curvesAsEdgesOnFace(this.curves, face, scaleMode);
        const wire = assembleWire(edges);
        oc.BRepLib.BuildCurves3d(wire.wrapped);
        const wireFixer = new oc.ShapeFix_Wire(wire.wrapped, face.wrapped, 1e-9);
        wireFixer.FixEdgeCurves();
        wireFixer.delete();
        const sketch = new Sketch(wire);
        if (wire.isClosed) {
            const baseFace = sketch.clone().face();
            sketch.defaultOrigin = baseFace.pointOnSurface(0.5, 0.5);
            sketch.defaultDirection = baseFace.normalAt();
            if (baseFace.orientation !== face.orientation) {
                sketch.defaultDirection = sketch.defaultDirection.multiply(-1);
            }
            sketch.baseFace = face;
        } else {
            const startPoint = wire.startPoint;
            sketch.defaultOrigin = startPoint;
            sketch.defaultDirection = face.normalAt(startPoint);
            sketch.baseFace = face;
        }
        return sketch;
    }
    subFace(face, origin) {
        let subFace = this.translate(face.uvCoordinates(origin || face.center)).sketchOnFace(face, "original").face();
        if (subFace.orientation !== face.orientation) {
            subFace = subFace.flipOrientation();
        }
        return subFace;
    }
    punchHole(shape, face, { height = null, origin = null, draftAngle = 0 } = {}) {
        const oc = getOC();
        const gc = GCWithScope();
        const foundFace = getSingleFace(face, shape);
        const hole = this.subFace(foundFace, origin);
        const maker = gc(new oc.BRepFeat_MakeDPrism(shape.wrapped, hole.wrapped, foundFace.wrapped, draftAngle * DEG2RAD, 0, false));
        if (height) {
            maker.Perform(height);
        } else {
            maker.PerformThruAll();
        }
        return cast(maker.Shape());
    }
    toSVGPathD() {
        const r = GCWithScope();
        const bp = this.clone().mirror([
            1,
            0
        ], [
            0,
            0
        ], "plane");
        const compatibleCurves = approximateAsSvgCompatibleCurve(bp.curves);
        const path = compatibleCurves.flatMap((c)=>{
            return adaptedCurveToPathElem(r(c.adaptor()), c.lastPoint);
        });
        const [startX, startY] = bp.curves[0].firstPoint;
        return `M ${round5(startX)} ${round5(startY)} ${path.join(" ")}${bp.isClosed() ? " Z" : ""}`;
    }
    toSVGPath() {
        return `<path d="${this.toSVGPathD()}" />`;
    }
    toSVGViewBox(margin = 1) {
        return viewbox(this.boundingBox, margin);
    }
    toSVGPaths() {
        return [
            this.toSVGPathD()
        ];
    }
    toSVG(margin = 1) {
        return asSVG(this.toSVGPath(), this.boundingBox, margin);
    }
    get firstPoint() {
        return this.curves[0].firstPoint;
    }
    get lastPoint() {
        return this.curves[this.curves.length - 1].lastPoint;
    }
    isInside(point) {
        if (!this.boundingBox.containsPoint(point)) return false;
        const oc = getOC();
        const intersector = new oc.Geom2dAPI_InterCurveCurve();
        const segment = make2dSegmentCurve(point, this.boundingBox.outsidePoint());
        let crossCounts = 0;
        const onCurve = this.curves.find((c)=>c.isOnCurve(point));
        if (onCurve) return false;
        this.curves.forEach((c)=>{
            if (c.boundingBox.isOut(segment.boundingBox)) return;
            intersector.Init(segment.wrapped, c.wrapped, 1e-9);
            crossCounts += intersector.NbPoints();
        });
        intersector.delete();
        return !!(crossCounts % 2);
    }
    isClosed() {
        return samePoint(this.firstPoint, this.lastPoint);
    }
    intersects(other) {
        const oc = getOC();
        const intersector = new oc.Geom2dAPI_InterCurveCurve();
        if (this.boundingBox.isOut(other.boundingBox)) return false;
        for (const myCurve of this.curves){
            for (const otherCurve of other.curves){
                if (myCurve.boundingBox.isOut(otherCurve.boundingBox)) continue;
                intersector.Init(myCurve.wrapped, otherCurve.wrapped, 1e-9);
                if (intersector.NbPoints() || intersector.NbSegments()) return true;
            }
        }
        intersector.delete();
        return false;
    }
}
