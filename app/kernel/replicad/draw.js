import { BoundingBox2d, deserializeCurve2D, make2dCircle, make2dEllipse, make2dInerpolatedBSplineCurve, make2dSegmentCurve, samePoint, stitchCurves } from "./lib2d/index.js";
import { Blueprint, cut2D, intersect2D, fuse2D, polysidesBlueprint, roundedRectangleBlueprint, Blueprints, CompoundBlueprint } from "./blueprints/index.js";

import { BaseSketcher2d } from "./Sketcher2d.js";
import { textBlueprints } from "./text.js";
import { lookFromPlane, ProjectionCamera } from "./projection/ProjectionCamera.js";
import { makeProjectedEdges } from "./projection/makeProjectedEdges.js";
import offset from "./blueprints/offset.js";
import { CornerFinder } from "./finders/cornerFinder.js";
import { fillet2D, chamfer2D } from "./blueprints/customCorners.js";
import { edgeToCurve, edgeToCurveOnPlane } from "./curves.js";

import { approximateForSVG } from "./blueprints/approximations.js";

export class Drawing {
    innerShape;
    constructor(innerShape = null){
        this.innerShape = innerShape;
    }
    clone() {
        return new Drawing(this.innerShape?.clone() || null);
    }
    serialize() {
        function serializeHelper(shape) {
            if (shape instanceof CompoundBlueprint) {
                return {
                    type: "CompoundBlueprint",
                    blueprints: shape.blueprints.map(serializeHelper)
                };
            } else if (shape instanceof Blueprints) {
                return {
                    type: "Blueprints",
                    blueprints: shape.blueprints.map(serializeHelper)
                };
            } else if (shape instanceof Blueprint) {
                return {
                    type: "Blueprint",
                    curves: shape.curves.map((c)=>c.serialize())
                };
            } else {
                throw new Error("Unknown shape type for serialization");
            }
        }
        return JSON.stringify(serializeHelper(this.innerShape));
    }
    get boundingBox() {
        if (!this.innerShape) return new BoundingBox2d();
        return this.innerShape.boundingBox;
    }
    stretch(ratio, direction, origin) {
        if (!this.innerShape) return new Drawing();
        return new Drawing(this.innerShape.stretch(ratio, direction, origin));
    }
    get repr() {
        if (this.innerShape === null) return "=== empty shape";
        return this.innerShape.repr;
    }
    rotate(angle, center) {
        if (!this.innerShape) return new Drawing();
        return new Drawing(this.innerShape.rotate(angle, center));
    }
    translate(xDistOrPoint, yDist = 0) {
        if (!this.innerShape) return new Drawing();
        return new Drawing(this.innerShape.translate(xDistOrPoint, yDist));
    }
    scale(scaleFactor, center) {
        if (!this.innerShape) return new Drawing();
        return new Drawing(this.innerShape.scale(scaleFactor, center));
    }
    mirror(centerOrDirection, origin, mode) {
        if (!this.innerShape) return new Drawing();
        return new Drawing(this.innerShape.mirror(centerOrDirection, origin, mode));
    }
    cut(other) {
        return new Drawing(cut2D(this.innerShape, other.innerShape));
    }
    fuse(other) {
        return new Drawing(fuse2D(this.innerShape, other.innerShape));
    }
    intersect(other) {
        return new Drawing(intersect2D(this.innerShape, other.innerShape));
    }
    fillet(radius, filter) {
        const finder = filter && filter(new CornerFinder(), this.innerShape);
        return new Drawing(fillet2D(this.innerShape, radius, finder));
    }
    chamfer(radius, filter) {
        const finder = filter && filter(new CornerFinder(), this.innerShape);
        return new Drawing(chamfer2D(this.innerShape, radius, finder));
    }
    sketchOnPlane(inputPlane, origin) {
        if (!this.innerShape) throw new Error("Trying to sketch an empty drawing");
        return this.innerShape.sketchOnPlane(inputPlane, origin);
    }
    sketchOnFace(face, scaleMode) {
        if (!this.innerShape) throw new Error("Trying to sketch an empty drawing");
        return this.innerShape.sketchOnFace(face, scaleMode);
    }
    punchHole(shape, faceFinder, options = {}) {
        if (!this.innerShape) return shape;
        return this.innerShape.punchHole(shape, faceFinder, options);
    }
    toSVG(margin) {
        return this.innerShape?.toSVG(margin) || "";
    }
    toSVGViewBox(margin = 1) {
        return this.innerShape?.toSVGViewBox(margin) || "";
    }
    toSVGPaths() {
        return this.innerShape?.toSVGPaths() || [];
    }
    offset(distance, offsetConfig = {}) {
        return new Drawing(offset(this.innerShape, distance, offsetConfig));
    }
    approximate(target, options = {}) {
        if (target !== "svg") {
            throw new Error("Only 'svg' is supported for now");
        }
        return new Drawing(approximateForSVG(this.innerShape, options));
    }
    get blueprint() {
        if (!(this.innerShape instanceof Blueprint)) {
            if (this.innerShape instanceof Blueprints && this.innerShape.blueprints.length === 1 && this.innerShape.blueprints[0] instanceof Blueprint) {
                return this.innerShape.blueprints[0];
            }
            throw new Error("This drawing is not a blueprint");
        }
        return this.innerShape;
    }
}
export class DrawingPen extends BaseSketcher2d {
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
        return new Drawing(new Blueprint(this.pendingCurves));
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
export function deserializeDrawing(data) {
    function deserializeHelper(json) {
        if (json["type"] === "CompoundBlueprint") {
            const blueprints = json["blueprints"].map(deserializeHelper);
            return new CompoundBlueprint(blueprints);
        } else if (json["type"] === "Blueprints") {
            const blueprints = json["blueprints"].map(deserializeHelper);
            return new Blueprints(blueprints);
        } else if (json["type"] === "Blueprint") {
            const curves = json["curves"].map((c)=>deserializeCurve2D(c));
            return new Blueprint(curves);
        } else {
            throw new Error("Unknown shape type for deserialization");
        }
    }
    const json = JSON.parse(data);
    const shape = deserializeHelper(json);
    return new Drawing(shape);
}
export function draw(initialPoint) {
    const pen = new DrawingPen();
    if (initialPoint) {
        pen.movePointerTo(initialPoint);
    }
    return pen;
}
export function drawRoundedRectangle(width, height, r = 0) {
    return new Drawing(roundedRectangleBlueprint(width, height, r));
}
export const drawRectangle = drawRoundedRectangle;
export function drawSingleCircle(radius) {
    return new Drawing(new Blueprint([
        make2dCircle(radius)
    ]));
}
export function drawSingleEllipse(majorRadius, minorRadius) {
    const [minor, major] = [
        majorRadius,
        minorRadius
    ].sort((a, b)=>a - b);
    const direction = major === majorRadius ? [
        1,
        0
    ] : [
        0,
        1
    ];
    return new Drawing(new Blueprint([
        make2dEllipse(major, minor, direction)
    ]));
}
export function drawCircle(radius) {
    return draw().movePointerTo([
        -radius,
        0
    ]).sagittaArc(2 * radius, 0, radius).sagittaArc(-2 * radius, 0, radius).close();
}
export function drawEllipse(majorRadius, minorRadius) {
    return draw().movePointerTo([
        -majorRadius,
        0
    ]).halfEllipse(2 * majorRadius, 0, minorRadius).halfEllipse(-2 * majorRadius, 0, minorRadius).close();
}
export function drawPolysides(radius, sidesCount, sagitta = 0) {
    return new Drawing(polysidesBlueprint(radius, sidesCount, sagitta));
}
export function drawText(text, { startX = 0, startY = 0, fontSize = 16, fontFamily = "default" } = {}) {
    return new Drawing(textBlueprints(text, {
        startX,
        startY,
        fontSize,
        fontFamily
    }));
}
export const drawPointsInterpolation = (points, approximationConfig = {}, options = {})=>{
    const curves = [
        make2dInerpolatedBSplineCurve(points, approximationConfig)
    ];
    if (options.closeShape && !samePoint(points[0], points[points.length - 1])) {
        curves.push(make2dSegmentCurve(points[points.length - 1], points[0]));
    }
    return new Drawing(new Blueprint(curves));
};
export const drawParametricFunction = (func, { pointsCount = 400, start = 0, stop = 1, closeShape = false } = {}, approximationConfig = {})=>{
    const stepSize = (stop - start) / pointsCount;
    const points = [
        ...Array(pointsCount + 1).keys()
    ].map((t)=>{
        return func(start + t * stepSize);
    });
    return drawPointsInterpolation(points, approximationConfig, {
        closeShape
    });
};
const edgesToDrawing = (edges)=>{
    const planeFace = drawRectangle(1000, 1000).sketchOnPlane().face();
    const curves = edges.map((e)=>{
        try {
            return edgeToCurveOnPlane(e);
        } catch (_error) {
            return edgeToCurve(e, planeFace);
        }
    });
    const stitchedCurves = stitchCurves(curves).map((s)=>new Blueprint(s));
    if (stitchedCurves.length === 0) return new Drawing();
    if (stitchedCurves.length === 1) return new Drawing(stitchedCurves[0]);
    return new Drawing(new Blueprints(stitchedCurves));
};
export function drawProjection(shape, projectionCamera = "front") {
    let camera;
    if (projectionCamera instanceof ProjectionCamera) {
        camera = projectionCamera;
    } else {
        camera = lookFromPlane(projectionCamera);
    }
    const { visible, hidden } = makeProjectedEdges(shape, camera);
    return {
        visible: edgesToDrawing(visible),
        hidden: edgesToDrawing(hidden)
    };
}
export function drawFaceOutline(face) {
    const outerWire = face.clone().outerWire();
    const curves = outerWire.edges.map((e)=>edgeToCurve(e, face));
    const stitchedCurves = stitchCurves(curves).map((s)=>new Blueprint(s));
    if (stitchedCurves.length === 0) return new Drawing();
    if (stitchedCurves.length === 1) return new Drawing(stitchedCurves[0]);
    return new Drawing(new Blueprints(stitchedCurves));
}
