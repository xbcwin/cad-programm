
import { findCurveType } from "../definitionMaps.js";
import { getOC } from "../oclib.js";
import { GCWithScope } from "../register.js";
import { Curve2D } from "./Curve2D.js";
import { samePoint } from "./vectorOperations.js";
export const approximateAsBSpline = (adaptor, tolerance = 1e-4, continuity = "C0", maxSegments = 200)=>{
    const oc = getOC();
    const r = GCWithScope();
    const continuities = {
        C0: oc.GeomAbs_Shape.GeomAbs_C0,
        C1: oc.GeomAbs_Shape.GeomAbs_C1,
        C2: oc.GeomAbs_Shape.GeomAbs_C2,
        C3: oc.GeomAbs_Shape.GeomAbs_C3
    };
    const convert = r(new oc.Geom2dConvert_ApproxCurve(adaptor.ShallowCopy(), tolerance, continuities[continuity], maxSegments, 3));
    return new Curve2D(convert.Curve());
};
export const BSplineToBezier = (adaptor)=>{
    if (findCurveType(adaptor.GetType()) !== "BSPLINE_CURVE") throw new Error("You can only convert a Bspline");
    const handle = adaptor.BSpline();
    const firstParameter = adaptor.FirstParameter();
    const lastParameter = adaptor.LastParameter();
    const oc = getOC();
    const convert = new oc.Geom2dConvert_BSplineCurveToBezierCurve(handle, firstParameter, lastParameter, 1e-9);
    function* bezierCurves() {
        const nArcs = convert.NbArcs();
        if (!nArcs) return;
        for(let i = 1; i <= nArcs; i++){
            const arc = convert.Arc(i);
            yield new Curve2D(arc);
        }
    }
    const curves = Array.from(bezierCurves());
    convert.delete();
    return curves;
};
export function approximateAsSvgCompatibleCurve(curves, options = {
    tolerance: 1e-4,
    continuity: "C0",
    maxSegments: 300
}) {
    const r = GCWithScope();
    return curves.flatMap((curve)=>{
        const adaptor = r(curve.adaptor());
        const curveType = findCurveType(adaptor.GetType());
        const midpointParameter = 0.5 * (curve.firstParameter + curve.lastParameter);
        if (curveType === "ELLIPSE" || curveType === "CIRCLE" && samePoint(curve.firstPoint, curve.lastPoint)) {
            return curve.splitAt([
                midpointParameter
            ]);
        }
        if ([
            "LINE",
            "ELLIPSE",
            "CIRCLE"
        ].includes(curveType)) {
            return curve;
        }
        if (curveType === "BEZIER_CURVE") {
            const b = adaptor.Bezier();
            const deg = b.Degree();
            if (!b.IsRational() && [
                1,
                2,
                3
            ].includes(deg)) {
                return curve;
            }
        }
        if (curveType === "BSPLINE_CURVE") {
            const bspline = adaptor.BSpline();
            if (!bspline.IsRational()) {
                const c = BSplineToBezier(adaptor);
                return approximateAsSvgCompatibleCurve(c, options);
            }
        }
        const bspline = approximateAsBSpline(adaptor, options.tolerance, options.continuity, options.maxSegments);
        return approximateAsSvgCompatibleCurve(BSplineToBezier(r(bspline.adaptor())), options);
    });
}
