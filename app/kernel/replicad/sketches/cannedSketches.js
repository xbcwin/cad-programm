import { assembleWire, makeBSplineApproximation, makeCircle, makeEllipse, makeHelix } from "../shapeHelpers.js";
import { Plane, Vector } from "../geom.js";
import Sketcher from "../Sketcher.js";
import { makePlane } from "../geomHelpers.js";
import Sketch from "./Sketch.js";


import { localGC } from "../register.js";
import { roundedRectangleBlueprint } from "../blueprints/cannedBlueprints.js";
export const sketchCircle = (radius, planeConfig = {})=>{
    const plane = planeConfig.plane instanceof Plane ? makePlane(planeConfig.plane) : makePlane(planeConfig.plane, planeConfig.origin);
    const wire = assembleWire([
        makeCircle(radius, plane.origin, plane.zDir)
    ]);
    const sketch = new Sketch(wire, {
        defaultOrigin: plane.origin,
        defaultDirection: plane.zDir
    });
    plane.delete();
    return sketch;
};
export const sketchEllipse = (xRadius = 1, yRadius = 2, planeConfig = {})=>{
    const plane = planeConfig.plane instanceof Plane ? makePlane(planeConfig.plane) : makePlane(planeConfig.plane, planeConfig.origin);
    const xDir = new Vector(plane.xDir);
    let majR = xRadius;
    let minR = yRadius;
    if (yRadius > xRadius) {
        xDir.rotate(90, plane.origin, plane.zDir);
        majR = yRadius;
        minR = xRadius;
    }
    const wire = assembleWire([
        makeEllipse(majR, minR, plane.origin, plane.zDir, xDir)
    ]);
    xDir.delete();
    const sketch = new Sketch(wire, {
        defaultOrigin: plane.origin,
        defaultDirection: plane.zDir
    });
    plane.delete();
    return sketch;
};
export const sketchRectangle = (xLength, yLength, planeConfig = {})=>{
    const sketcher = planeConfig.plane instanceof Plane ? new Sketcher(planeConfig.plane) : new Sketcher(planeConfig.plane, planeConfig.origin);
    return sketcher.movePointerTo([
        -xLength / 2,
        -yLength / 2
    ]).hLine(xLength).vLine(yLength).hLine(-xLength).vLine(-yLength).done();
};
export const sketchRoundedRectangle = (width, height, r = 0, planeConfig = {})=>{
    const bp = roundedRectangleBlueprint(width, height, r);
    return bp.sketchOnPlane(planeConfig.plane, planeConfig.origin);
};
export const sketchPolysides = (radius, sidesCount, sagitta = 0, planeConfig = {})=>{
    const points = [
        ...Array(sidesCount).keys()
    ].map((i)=>{
        const theta = -(Math.PI * 2 / sidesCount) * i;
        return [
            radius * Math.sin(theta),
            radius * Math.cos(theta)
        ];
    });
    const sketcher = planeConfig.plane instanceof Plane ? new Sketcher(planeConfig.plane) : new Sketcher(planeConfig.plane, planeConfig.origin);
    const sketch = sketcher.movePointerTo([
        points[points.length - 1][0],
        points[points.length - 1][1]
    ]);
    if (sagitta) {
        points.forEach(([x, y])=>sketch.sagittaArcTo([
                x,
                y
            ], sagitta));
    } else {
        points.forEach(([x, y])=>sketch.lineTo([
                x,
                y
            ]));
    }
    return sketch.done();
};
export const polysideInnerRadius = (outerRadius, sidesCount, sagitta = 0)=>{
    const innerAngle = Math.PI / sidesCount;
    const innerRadius = Math.cos(innerAngle) * outerRadius;
    if (sagitta >= 0) return innerRadius;
    return innerRadius + sagitta;
};
export const sketchFaceOffset = (face, offset)=>{
    const defaultOrigin = face.center;
    const defaultDirection = face.normalAt();
    const wire = face.outerWire().offset2D(offset);
    const sketch = new Sketch(wire, {
        defaultOrigin,
        defaultDirection
    });
    defaultOrigin.delete();
    defaultDirection.delete();
    return sketch;
};
export const sketchParametricFunction = (func, planeConfig = {}, { pointsCount = 400, start = 0, stop = 1 } = {}, approximationConfig = {})=>{
    const [r, gc] = localGC();
    const plane = r(planeConfig.plane instanceof Plane ? makePlane(planeConfig.plane) : makePlane(planeConfig.plane, planeConfig.origin));
    const stepSize = (stop - start) / pointsCount;
    const points = [
        ...Array(pointsCount + 1).keys()
    ].map((t)=>{
        const point = func(start + t * stepSize);
        return r(plane.toWorldCoords(point));
    });
    const wire = assembleWire([
        r(makeBSplineApproximation(points, approximationConfig))
    ]);
    const sketch = new Sketch(wire, {
        defaultOrigin: plane.origin,
        defaultDirection: plane.zDir
    });
    gc();
    return sketch;
};
export const sketchHelix = (pitch, height, radius, center = [
    0,
    0,
    0
], dir = [
    0,
    0,
    1
], lefthand = false)=>{
    return new Sketch(assembleWire(makeHelix(pitch, height, radius, center, dir, lefthand).wires));
};
