import { getOC } from "./oclib.js";
let CURVE_TYPES_MAP = null;
const getCurveTypesMap = (refresh)=>{
    if (CURVE_TYPES_MAP && !refresh) return CURVE_TYPES_MAP;
    const oc = getOC();
    const ga = oc.GeomAbs_CurveType;
    CURVE_TYPES_MAP = new Map([
        [
            ga.GeomAbs_Line,
            "LINE"
        ],
        [
            ga.GeomAbs_Circle,
            "CIRCLE"
        ],
        [
            ga.GeomAbs_Ellipse,
            "ELLIPSE"
        ],
        [
            ga.GeomAbs_Hyperbola,
            "HYPERBOLA"
        ],
        [
            ga.GeomAbs_Parabola,
            "PARABOLA"
        ],
        [
            ga.GeomAbs_BezierCurve,
            "BEZIER_CURVE"
        ],
        [
            ga.GeomAbs_BSplineCurve,
            "BSPLINE_CURVE"
        ],
        [
            ga.GeomAbs_OffsetCurve,
            "OFFSET_CURVE"
        ],
        [
            ga.GeomAbs_OtherCurve,
            "OTHER_CURVE"
        ]
    ]);
    return CURVE_TYPES_MAP;
};
export const findCurveType = (type)=>{
    let shapeType = getCurveTypesMap().get(type);
    if (!shapeType) shapeType = getCurveTypesMap(true).get(type);
    if (!shapeType) throw new Error("unknown type");
    return shapeType;
};
