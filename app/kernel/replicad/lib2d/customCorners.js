import { Curve2D } from "./Curve2D.js";
import { isPoint2D } from "./definitions.js";
import { intersectCurves } from "./intersections.js";
import { make2dArcFromCenter, make2dCircle, make2dSegmentCurve, make2dThreePointArc } from "./makeCurves.js";
import { make2dOffset } from "./offset.js";
import { add2d, crossProduct2d, normalize2d, scalarMultiply2d } from "./vectorOperations.js";
function removeCorner(firstCurve, secondCurve, radius) {
    const sinAngle = crossProduct2d(firstCurve.tangentAt(1), secondCurve.tangentAt(0));
    if (Math.abs(sinAngle) < 1e-10) return null;
    const orientationCorrection = sinAngle > 0 ? -1 : 1;
    const offset = Math.abs(radius) * orientationCorrection;
    const firstOffset = make2dOffset(firstCurve, offset);
    const secondOffset = make2dOffset(secondCurve, offset);
    if (!(firstOffset instanceof Curve2D) || !(secondOffset instanceof Curve2D)) {
        return null;
    }
    let potentialCenter;
    try {
        const { intersections } = intersectCurves(firstOffset, secondOffset, 1e-9);
        potentialCenter = intersections.at(-1);
    } catch (e) {
        return null;
    }
    if (!isPoint2D(potentialCenter)) {
        return null;
    }
    const center = potentialCenter;
    const splitForFillet = (curve, offsetCurve)=>{
        const [x, y] = offsetCurve.tangentAt(center);
        const normal = normalize2d([
            -y,
            x
        ]);
        const splitPoint = add2d(center, scalarMultiply2d(normal, offset));
        const splitParam = curve.parameter(splitPoint, 1e-6);
        return curve.splitAt([
            splitParam
        ]);
    };
    const [first] = splitForFillet(firstCurve, firstOffset);
    const [, second] = splitForFillet(secondCurve, secondOffset);
    return {
        first,
        second,
        center
    };
}
export function filletCurves(firstCurve, secondCurve, radius) {
    const cornerRemoved = removeCorner(firstCurve, secondCurve, radius);
    if (!cornerRemoved) {
        console.warn("Cannot fillet between curves", firstCurve.repr, secondCurve.repr);
        return [
            firstCurve,
            secondCurve
        ];
    }
    const { first, second, center } = cornerRemoved;
    return [
        first,
        make2dArcFromCenter(first.lastPoint, second.firstPoint, center),
        second
    ];
}
export function chamferCurves(firstCurve, secondCurve, radius) {
    const cornerRemoved = removeCorner(firstCurve, secondCurve, radius);
    if (!cornerRemoved) {
        console.warn("Cannot chamfer between curves", firstCurve.repr, secondCurve.repr);
        return [
            firstCurve,
            secondCurve
        ];
    }
    const { first, second } = cornerRemoved;
    return [
        first,
        make2dSegmentCurve(first.lastPoint, second.firstPoint),
        second
    ];
}
export function dogboneFilletCurves(firstCurve, secondCurve, radius) {
    const tgt1 = normalize2d(firstCurve.tangentAt(1));
    const tgt2 = normalize2d(secondCurve.tangentAt(0));
    const sinAngle = crossProduct2d(tgt1, tgt2);
    const a = Math.asin(sinAngle);
    if (Math.abs(sinAngle) < 1e-10) return [
        firstCurve,
        secondCurve
    ];
    const orientationCorrection = sinAngle > 0 ? -1 : 1;
    const offset = Math.abs(radius) * Math.sin(a / 2) * orientationCorrection;
    const firstOffset = make2dOffset(firstCurve, offset);
    const secondOffset = make2dOffset(secondCurve, offset);
    if (!(firstOffset instanceof Curve2D) || !(secondOffset instanceof Curve2D)) {
        return [
            firstCurve,
            secondCurve
        ];
    }
    let potentialCenter;
    try {
        const { intersections } = intersectCurves(firstOffset, secondOffset, 1e-9);
        potentialCenter = intersections.at(-1);
    } catch (e) {
        return [
            firstCurve,
            secondCurve
        ];
    }
    if (!isPoint2D(potentialCenter)) {
        return [
            firstCurve,
            secondCurve
        ];
    }
    const circle = make2dCircle(radius, potentialCenter);
    const firstInt = intersectCurves(firstCurve, circle).intersections[0];
    const secondInt = intersectCurves(secondCurve, circle).intersections.at(-1);
    if (!firstInt || !secondInt) return [
        firstCurve,
        secondCurve
    ];
    const firstPart = firstCurve.splitAt([
        firstInt
    ])[0];
    const secondPart = secondCurve.splitAt([
        secondInt
    ]).at(-1);
    if (!firstPart || !secondPart) {
        return [
            firstCurve,
            secondCurve
        ];
    }
    try {
        return [
            firstPart,
            make2dThreePointArc(firstPart.lastPoint, firstCurve.lastPoint, secondPart.firstPoint),
            secondPart
        ];
    } catch (e) {
        return [
            firstCurve,
            secondCurve
        ];
    }
}
