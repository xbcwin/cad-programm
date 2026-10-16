import { approximateAsSvgCompatibleCurve } from "../lib2d/index.js";
import Blueprint from "./Blueprint.js";
import Blueprints from "./Blueprints.js";

import CompoundBlueprint from "./CompoundBlueprint.js";
export function approximateForSVG(bp, options) {
    if (bp instanceof Blueprint) {
        return new Blueprint(approximateAsSvgCompatibleCurve(bp.curves, options));
    } else if (bp instanceof CompoundBlueprint) {
        return new CompoundBlueprint(bp.blueprints.map((b)=>approximateForSVG(b, options)));
    } else if (bp instanceof Blueprints) {
        return new Blueprints(bp.blueprints.map((b)=>approximateForSVG(b, options)));
    }
    return bp;
}
