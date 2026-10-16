import { getOC } from "../oclib.js";
import { GCWithScope } from "../register.js";
import { approximateAsBSpline } from "./approximations.js";
import { Curve2D } from "./Curve2D.js";

import { selfIntersections } from "./intersections.js";
import { make2dSegmentCurve } from "./makeCurves.js";
import { add2d, normalize2d, subtract2d } from "./vectorOperations.js";
const offsetEndPoints = (firstPoint, lastPoint, offset)=>{
    const tangent = normalize2d(subtract2d(lastPoint, firstPoint));
    const normal = [
        tangent[1],
        -tangent[0]
    ];
    const offsetVec = [
        normal[0] * offset,
        normal[1] * offset
    ];
    return {
        firstPoint: add2d(firstPoint, offsetVec),
        lastPoint: add2d(lastPoint, offsetVec)
    };
};
export const make2dOffset = (curve, offset)=>{
    const r = GCWithScope();
    const curveType = curve.geomType;
    if (curveType === "CIRCLE") {
        const circle = r(r(curve.adaptor()).Circle());
        const radius = circle.Radius();
        const orientationCorrection = circle.IsDirect() ? 1 : -1;
        const orientedOffset = offset * orientationCorrection;
        const newRadius = radius + orientedOffset;
        if (newRadius < 1e-10) {
            const centerPos = r(circle.Location());
            const center = [
                centerPos.X(),
                centerPos.Y()
            ];
            const offsetViaCenter = (point)=>{
                const [x, y] = normalize2d(subtract2d(point, center));
                return add2d(point, [
                    orientedOffset * x,
                    orientedOffset * y
                ]);
            };
            return {
                collapsed: true,
                firstPoint: offsetViaCenter(curve.firstPoint),
                lastPoint: offsetViaCenter(curve.lastPoint)
            };
        }
        const oc = getOC();
        const newCircle = new oc.gp_Circ2d(circle.Axis(), newRadius);
        const newInnerCurve = new oc.Geom2d_Circle(newCircle);
        const newCurve = new oc.Geom2d_TrimmedCurve(newInnerCurve, curve.firstParameter, curve.lastParameter, true, true);
        return new Curve2D(newCurve);
    }
    if (curveType === "LINE") {
        const { firstPoint, lastPoint } = offsetEndPoints(curve.firstPoint, curve.lastPoint, offset);
        return make2dSegmentCurve(firstPoint, lastPoint);
    }
    const oc = getOC();
    const offsetCurve = new Curve2D(new oc.Geom2d_OffsetCurve(curve.wrapped, offset, true));
    const approximation = approximateAsBSpline(offsetCurve.adaptor());
    const selfIntersects = selfIntersections(approximation);
    if (selfIntersects.length) {
        return {
            collapsed: true,
            firstPoint: approximation.firstPoint,
            lastPoint: approximation.lastPoint
        };
    }
    return approximation;
};
