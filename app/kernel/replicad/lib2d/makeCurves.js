
import { getOC } from "../oclib.js";
import { GCWithScope, localGC } from "../register.js";

import { axis2d, pnt, vec } from "./ocWrapper.js";
import { Curve2D } from "./Curve2D.js";
import { add2d, distance2d, normalize2d, samePoint, scalarMultiply2d, subtract2d } from "./vectorOperations.js";
export const make2dSegmentCurve = (startPoint, endPoint)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const segment = r(new oc.GC_MakeSegment2d(r(pnt(startPoint)), r(pnt(endPoint)))).Value();
    const curve = new Curve2D(segment);
    if (!samePoint(curve.firstPoint, startPoint)) {
        curve.reverse();
    }
    gc();
    return curve;
};
export const make2dThreePointArc = (startPoint, midPoint, endPoint)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const segment = r(new oc.GC_MakeArcOfCircle2d(r(pnt(startPoint)), r(pnt(midPoint)), r(pnt(endPoint)))).Value();
    const firstPoint = r(segment.Value(segment.FirstParameter()));
    if (!samePoint([
        firstPoint.X(),
        firstPoint.Y()
    ], startPoint)) {
        segment.SetTrim(segment.LastParameter(), segment.FirstParameter(), true, true);
    }
    gc();
    return new Curve2D(segment);
};
export const make2dTangentArc = (startPoint, tangent, endPoint)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const segment = r(new oc.GC_MakeArcOfCircle2d(r(pnt(startPoint)), r(vec(tangent)), r(pnt(endPoint)))).Value();
    const firstPoint = r(segment.Value(segment.FirstParameter()));
    if (!samePoint([
        firstPoint.X(),
        firstPoint.Y()
    ], startPoint)) {
        segment.SetTrim(segment.LastParameter(), segment.FirstParameter(), true, true);
    }
    gc();
    return new Curve2D(segment);
};
export const make2dCircle = (radius, center = [
    0,
    0
])=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const segment = r(new oc.GC_MakeCircle2d(r(pnt(center)), radius, true)).Value();
    gc();
    return new Curve2D(segment);
};
export const make2dEllipse = (majorRadius, minorRadius, xDir = [
    1,
    0
], center = [
    0,
    0
], direct = true)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const ellipse = r(new oc.gp_Elips2d(r(axis2d(center, xDir)), majorRadius, minorRadius, direct));
    const segment = r(new oc.GC_MakeEllipse2d(ellipse)).Value();
    gc();
    return new Curve2D(segment);
};
export const make2dEllipseArc = (majorRadius, minorRadius, startAngle, endAngle, center = [
    0,
    0
], xDir, direct = true)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const ellipse = r(new oc.gp_Elips2d(r(axis2d(center, xDir)), majorRadius, minorRadius, true));
    const segment = r(new oc.GC_MakeArcOfEllipse2d(ellipse, startAngle, endAngle, direct)).Value();
    gc();
    return new Curve2D(segment);
};
export const make2dBezierCurve = (startPoint, controls, endPoint)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const arrayOfPoints = r(new oc.NCollection_Array1_gp_Pnt2d(1, controls.length + 2));
    arrayOfPoints.SetValue(1, r(pnt(startPoint)));
    controls.forEach((p, i)=>{
        arrayOfPoints.SetValue(i + 2, r(pnt(p)));
    });
    arrayOfPoints.SetValue(controls.length + 2, r(pnt(endPoint)));
    const bezCurve = new oc.Geom2d_BezierCurve(arrayOfPoints);
    gc();
    return new Curve2D(bezCurve);
};
export function make2dInerpolatedBSplineCurve(points, { tolerance = 1e-3, smoothing = null, degMax = 3, degMin = 1 } = {}) {
    const r = GCWithScope();
    const oc = getOC();
    const pnts = r(new oc.NCollection_Array1_gp_Pnt2d(1, points.length));
    points.forEach((point, index)=>{
        pnts.SetValue(index + 1, r(pnt(point)));
    });
    let splineBuilder;
    if (smoothing) {
        splineBuilder = r(new oc.Geom2dAPI_PointsToBSpline());
        splineBuilder.Init(pnts, smoothing[0], smoothing[1], smoothing[2], degMax, oc.GeomAbs_Shape.GeomAbs_C2, tolerance);
    } else {
        splineBuilder = r(new oc.Geom2dAPI_PointsToBSpline());
        splineBuilder.Init(pnts, degMin, degMax, oc.GeomAbs_Shape.GeomAbs_C2, tolerance);
    }
    if (!splineBuilder.IsDone()) {
        throw new Error("B-spline approximation failed");
    }
    return new Curve2D(splineBuilder.Curve());
}
export const make2dArcFromCenter = (startPoint, endPoint, center, longArc = false)=>{
    const midChord = scalarMultiply2d(add2d(startPoint, endPoint), 0.5);
    const orientedRadius = distance2d(center, startPoint) * (longArc ? -1 : 1);
    const midChordDir = normalize2d(subtract2d(midChord, center));
    return make2dThreePointArc(startPoint, add2d(scalarMultiply2d(midChordDir, orientedRadius), center), endPoint);
};
