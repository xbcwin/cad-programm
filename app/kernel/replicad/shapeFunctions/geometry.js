import { findCurveType } from "../definitionMaps.js";
import { Vector } from "../geom.js";
import { getOC } from "../oclib.js";
import { WrappingObj } from "../register.js";
const unwrapCurve = (curve)=>"wrapped" in curve ? curve.wrapped : curve;
const mapCurveParameter = (curve, position)=>{
    const firstParam = curve.FirstParameter();
    const lastParam = curve.LastParameter();
    return firstParam + (lastParam - firstParam) * position;
};
export function curveType(curveInput) {
    const curve = unwrapCurve(curveInput);
    const technicalType = curve.GetType && curve.GetType();
    return findCurveType(technicalType);
}
export function curvePointAt(curveInput, position = 0.5) {
    const curve = unwrapCurve(curveInput);
    return new Vector(curve.Value(mapCurveParameter(curve, position)));
}
export function curveTangentAt(curveInput, position = 0.5) {
    const oc = getOC();
    const curve = unwrapCurve(curveInput);
    const parameter = mapCurveParameter(curve, position);
    const point = new oc.gp_Pnt();
    const derivative = new oc.gp_Vec();
    curve.D1(parameter, point, derivative);
    const tangent = new Vector(derivative);
    point.delete();
    derivative.delete();
    return tangent;
}
export class Curve extends WrappingObj {
    get repr() {
        const { startPoint, endPoint } = this;
        const retVal = `start: (${this.startPoint.repr}) end:(${this.endPoint.repr}}`;
        startPoint.delete();
        endPoint.delete();
        return retVal;
    }
    get curveType() {
        return curveType(this);
    }
    get startPoint() {
        return new Vector(this.wrapped.Value(this.wrapped.FirstParameter()));
    }
    get endPoint() {
        return new Vector(this.wrapped.Value(this.wrapped.LastParameter()));
    }
    pointAt(position = 0.5) {
        return curvePointAt(this, position);
    }
    tangentAt(position = 0.5) {
        return curveTangentAt(this, position);
    }
    get isClosed() {
        return this.wrapped.IsClosed();
    }
    get isPeriodic() {
        return this.wrapped.IsPeriodic();
    }
    get period() {
        return this.wrapped.Period();
    }
}
const unwrapSurface = (surface)=>"wrapped" in surface ? surface.wrapped : surface;
export function surfaceType(surfaceInput) {
    const oc = getOC();
    const ga = oc.GeomAbs_SurfaceType;
    const types = new Map([
        [
            ga.GeomAbs_Plane,
            "PLANE"
        ],
        [
            ga.GeomAbs_Cylinder,
            "CYLINDRE"
        ],
        [
            ga.GeomAbs_Cone,
            "CONE"
        ],
        [
            ga.GeomAbs_Sphere,
            "SPHERE"
        ],
        [
            ga.GeomAbs_Torus,
            "TORUS"
        ],
        [
            ga.GeomAbs_BezierSurface,
            "BEZIER_SURFACE"
        ],
        [
            ga.GeomAbs_BSplineSurface,
            "BSPLINE_SURFACE"
        ],
        [
            ga.GeomAbs_SurfaceOfRevolution,
            "REVOLUTION_SURFACE"
        ],
        [
            ga.GeomAbs_SurfaceOfExtrusion,
            "EXTRUSION_SURFACE"
        ],
        [
            ga.GeomAbs_OffsetSurface,
            "OFFSET_SURFACE"
        ],
        [
            ga.GeomAbs_OtherSurface,
            "OTHER_SURFACE"
        ]
    ]);
    const type = types.get(unwrapSurface(surfaceInput).GetType());
    if (!type) throw new Error("surface type not found");
    return type;
}
export class Surface extends WrappingObj {
    get surfaceType() {
        return surfaceType(this);
    }
}
