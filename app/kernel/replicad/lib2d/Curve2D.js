
import { findCurveType } from "../definitionMaps.js";
import precisionRound from "../utils/precisionRound.js";
import { getOC } from "../oclib.js";
import { GCWithScope, localGC, WrappingObj } from "../register.js";
import zip from "../utils/zip.js";
import { BoundingBox2d } from "./BoundingBox2d.js";
import { isPoint2D } from "./definitions.js";
import { pnt } from "./ocWrapper.js";
import { reprPnt } from "./utils.js";
import { distance2d, samePoint } from "./vectorOperations.js";
export function deserializeCurve2D(data) {
    const oc = getOC();
    const handle = oc.GeomToolsWrapper.Read(data);
    return new Curve2D(handle);
}
export class Curve2D extends WrappingObj {
    _boundingBox;
    constructor(handle){
        super(handle);
        this._boundingBox = null;
    }
    get boundingBox() {
        if (this._boundingBox) return this._boundingBox;
        const oc = getOC();
        const boundBox = new oc.Bnd_Box2d();
        oc.BndLib_Add2dCurve.Add(this.wrapped, 1e-6, boundBox);
        this._boundingBox = new BoundingBox2d(boundBox);
        return this._boundingBox;
    }
    get repr() {
        return `${this.geomType} ${reprPnt(this.firstPoint)} - ${reprPnt(this.lastPoint)}`;
    }
    get innerCurve() {
        return this.wrapped;
    }
    serialize() {
        const oc = getOC();
        return oc.GeomToolsWrapper.Write(this.wrapped);
    }
    value(parameter) {
        const pnt = this.innerCurve.Value(parameter);
        const vec = [
            pnt.X(),
            pnt.Y()
        ];
        pnt.delete();
        return vec;
    }
    get firstPoint() {
        return this.value(this.firstParameter);
    }
    get lastPoint() {
        return this.value(this.lastParameter);
    }
    get firstParameter() {
        return this.innerCurve.FirstParameter();
    }
    get lastParameter() {
        return this.innerCurve.LastParameter();
    }
    adaptor() {
        const oc = getOC();
        return new oc.Geom2dAdaptor_Curve(this.wrapped);
    }
    get geomType() {
        const adaptor = this.adaptor();
        const curveType = findCurveType(adaptor.GetType());
        adaptor.delete();
        return curveType;
    }
    clone() {
        return new Curve2D(this.innerCurve.Copy());
    }
    reverse() {
        this.innerCurve.Reverse();
    }
    distanceFromPoint(point) {
        const oc = getOC();
        const r = GCWithScope();
        const projector = r(new oc.Geom2dAPI_ProjectPointOnCurve(r(pnt(point)), this.wrapped));
        let curveToPoint = Infinity;
        try {
            curveToPoint = projector.LowerDistance();
        } catch (e) {
            curveToPoint = Infinity;
        }
        return Math.min(curveToPoint, distance2d(point, this.firstPoint), distance2d(point, this.lastPoint));
    }
    distanceFromCurve(curve) {
        const oc = getOC();
        const r = GCWithScope();
        let curveDistance = Infinity;
        const projector = r(new oc.Geom2dAPI_ExtremaCurveCurve(this.wrapped, curve.wrapped, this.firstParameter, this.lastParameter, curve.firstParameter, curve.lastParameter));
        try {
            curveDistance = projector.LowerDistance();
        } catch (e) {
            curveDistance = Infinity;
        }
        return Math.min(curveDistance, this.distanceFromPoint(curve.firstPoint), this.distanceFromPoint(curve.lastPoint), curve.distanceFromPoint(this.firstPoint), curve.distanceFromPoint(this.lastPoint));
    }
    distanceFrom(element) {
        if (isPoint2D(element)) {
            return this.distanceFromPoint(element);
        }
        return this.distanceFromCurve(element);
    }
    isOnCurve(point) {
        return this.distanceFromPoint(point) < 1e-9;
    }
    parameter(point, precision = 1e-9) {
        const oc = getOC();
        const r = GCWithScope();
        let lowerDistance;
        let lowerDistanceParameter;
        try {
            const projector = r(new oc.Geom2dAPI_ProjectPointOnCurve(r(pnt(point)), this.wrapped));
            lowerDistance = projector.LowerDistance();
            lowerDistanceParameter = projector.LowerDistanceParameter();
        } catch (e) {
            if (samePoint(point, this.firstPoint, precision)) return this.firstParameter;
            if (samePoint(point, this.lastPoint, precision)) return this.lastParameter;
            throw new Error("Failed to find parameter");
        }
        if (lowerDistance > precision) {
            throw new Error(`Point ${reprPnt(point)} not on curve ${this.repr}, ${lowerDistance.toFixed(9)}`);
        }
        return lowerDistanceParameter;
    }
    tangentAt(index) {
        const oc = getOC();
        const [r, gc] = localGC();
        let param;
        if (Array.isArray(index)) {
            param = this.parameter(index);
        } else {
            const paramLength = this.innerCurve.LastParameter() - this.innerCurve.FirstParameter();
            param = paramLength * index + this.innerCurve.FirstParameter();
        }
        const point = r(new oc.gp_Pnt2d());
        const dir = r(new oc.gp_Vec2d());
        this.innerCurve.D1(param, point, dir);
        const tgtVec = [
            dir.X(),
            dir.Y()
        ];
        gc();
        return tgtVec;
    }
    splitAt(points, precision = 1e-9) {
        const oc = getOC();
        const r = GCWithScope();
        let parameters = points.map((point)=>{
            if (isPoint2D(point)) return this.parameter(point, precision);
            return point;
        });
        parameters = Array.from(new Map(parameters.map((p)=>[
                precisionRound(p, -Math.log10(precision)),
                p
            ])).values()).sort((a, b)=>a - b);
        const firstParam = this.firstParameter;
        const lastParam = this.lastParameter;
        if (firstParam > lastParam) {
            parameters.reverse();
        }
        if (Math.abs(parameters[0] - firstParam) < precision * 100) parameters = parameters.slice(1);
        if (!parameters.length) return [
            this
        ];
        if (Math.abs(parameters[parameters.length - 1] - lastParam) < precision * 100) parameters = parameters.slice(0, -1);
        if (!parameters.length) return [
            this
        ];
        return zip([
            [
                firstParam,
                ...parameters
            ],
            [
                ...parameters,
                lastParam
            ]
        ]).map(([first, last])=>{
            try {
                if (this.geomType === "BEZIER_CURVE") {
                    const curveCopy = new oc.Geom2d_BezierCurve(r(this.adaptor()).Bezier().Poles());
                    curveCopy.Segment(first, last);
                    return new Curve2D(curveCopy);
                }
                if (this.geomType === "BSPLINE_CURVE") {
                    const adapted = r(this.adaptor()).BSpline();
                    const curveCopy = new oc.Geom2d_BSplineCurve(adapted.Poles(), adapted.Knots(), adapted.Multiplicities(), adapted.Degree(), adapted.IsPeriodic());
                    curveCopy.Segment(first, last, precision);
                    return new Curve2D(curveCopy);
                }
                const trimmed = new oc.Geom2d_TrimmedCurve(this.wrapped, first, last, true, true);
                return new Curve2D(trimmed);
            } catch (e) {
                throw new Error("Failed to split the curve");
            }
        });
    }
}
