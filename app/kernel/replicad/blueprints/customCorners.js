
import { chamferCurves, filletCurves, samePoint, dogboneFilletCurves } from "../lib2d/index.js";
import Blueprint from "./Blueprint.js";
import Blueprints from "./Blueprints.js";

import CompoundBlueprint from "./CompoundBlueprint.js";
function modifyCorners(makeCorner, blueprint, radius, finder) {
    let modifyCorner = ()=>true;
    if (finder) {
        modifyCorner = finder.shouldKeep.bind(finder);
    }
    const curves = [
        blueprint.curves[0]
    ];
    const addModifiedCorner = (firstCurve, secondCurve)=>{
        if (modifyCorner({
            firstCurve,
            secondCurve,
            point: firstCurve.lastPoint
        })) {
            curves.push(...makeCorner(firstCurve, secondCurve, radius));
        } else {
            curves.push(firstCurve, secondCurve);
        }
    };
    blueprint.curves.slice(1).forEach((secondCurve)=>{
        const firstCurve = curves.pop();
        if (!firstCurve) throw new Error("Bug in the blueprint filletting algo");
        addModifiedCorner(firstCurve, secondCurve);
    });
    const lastCurve = curves.at(-1);
    if (!lastCurve) throw new Error("Bug in the blueprint corner algo");
    if (samePoint(curves[0].firstPoint, lastCurve.lastPoint) && curves.length > 1) {
        const firstCurve = curves.pop();
        const secondCurve = curves.shift();
        if (!firstCurve || !secondCurve) throw new Error("Bug in the blueprint filletting algo");
        addModifiedCorner(firstCurve, secondCurve);
    }
    return new Blueprint(curves);
}
function modifyCorner2D(makeCorner, shape, radius, finder) {
    if (shape instanceof Blueprint) {
        return modifyCorners(makeCorner, shape, radius, finder);
    }
    if (shape instanceof CompoundBlueprint) {
        return new CompoundBlueprint(shape.blueprints.map((b)=>modifyCorners(makeCorner, b, radius, finder)));
    }
    if (shape instanceof Blueprints) {
        const bps = shape.blueprints.map((b)=>modifyCorner2D(makeCorner, b, radius, finder)).filter((b)=>b !== null);
        return new Blueprints(bps);
    }
    return null;
}
export function fillet2D(shape, radius, finder) {
    return modifyCorner2D(filletCurves, shape, radius, finder);
}
export function chamfer2D(shape, radius, finder) {
    return modifyCorner2D(chamferCurves, shape, radius, finder);
}
export function dogbone2D(shape, radius, finder) {
    return modifyCorner2D(dogboneFilletCurves, shape, radius, finder);
}
