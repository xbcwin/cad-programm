import zip from "../utils/zip.js";
import { samePoint as defaultSamePoint, intersectCurves, removeDuplicatePoints } from "../lib2d/index.js";
import Blueprint from "./Blueprint.js";
import Blueprints from "./Blueprints.js";
import CompoundBlueprint from "./CompoundBlueprint.js";
import { organiseBlueprints } from "./lib.js";
const PRECISION = 1e-9;
const samePoint = (x, y)=>defaultSamePoint(x, y, PRECISION);
const curveMidPoint = (curve)=>{
    const midParameter = (curve.lastParameter + curve.firstParameter) / 2;
    return curve.value(midParameter);
};
const rotateToStartAt = (curves, point)=>{
    const startIndex = curves.findIndex((curve)=>{
        return samePoint(point, curve.firstPoint);
    });
    const start = curves.slice(0, startIndex);
    const end = curves.slice(startIndex);
    return end.concat(start);
};
const rotateToStartAtSegment = (curves, segment)=>{
    const onSegment = (curve)=>{
        return samePoint(segment.firstPoint, curve.firstPoint) && samePoint(segment.lastPoint, curve.lastPoint);
    };
    let startIndex = curves.findIndex(onSegment);
    if (startIndex === -1) {
        curves = reverseSegment(curves);
        startIndex = curves.findIndex(onSegment);
        if (startIndex === -1) {
            console.error(curves.map((c)=>c.repr), segment.repr);
            throw new Error("Failed to rotate to segment start");
        }
    }
    const start = curves.slice(0, startIndex);
    const end = curves.slice(startIndex);
    return end.concat(start);
};
function* createSegmentOnPoints(curves, allIntersections, allCommonSegments) {
    const endsAtIntersection = (curve)=>{
        return !!allIntersections.find((intersection)=>{
            return samePoint(intersection, curve.lastPoint);
        });
    };
    const isCommonSegment = (curve)=>{
        return !!allCommonSegments.find((segment)=>{
            return samePoint(segment.firstPoint, curve.firstPoint) && samePoint(segment.lastPoint, curve.lastPoint) || samePoint(segment.firstPoint, curve.lastPoint) && samePoint(segment.lastPoint, curve.firstPoint);
        });
    };
    let currentCurves = [];
    for (const curve of curves){
        if (endsAtIntersection(curve)) {
            currentCurves.push(curve);
            yield currentCurves;
            currentCurves = [];
        } else if (isCommonSegment(curve)) {
            if (currentCurves.length) {
                yield currentCurves;
                currentCurves = [];
            }
            yield [
                curve
            ];
        } else {
            currentCurves.push(curve);
        }
    }
    if (currentCurves.length) {
        yield currentCurves;
    }
}
const startOfSegment = (s)=>{
    return s[0].firstPoint;
};
const endOfSegment = (s)=>{
    return s[s.length - 1].lastPoint;
};
const reverseSegment = (segment)=>{
    segment.reverse();
    return segment.map((curve)=>{
        const newCurve = curve.clone();
        newCurve.reverse();
        return newCurve;
    });
};
const reverseSegments = (s)=>{
    s.reverse();
    return s.map(reverseSegment);
};
function removeNonCrossingPoint(allIntersections, segmentedCurve, blueprintToCheck) {
    return allIntersections.filter((intersection)=>{
        const segmentsOfIntersection = segmentedCurve.filter((s)=>{
            return samePoint(s.firstPoint, intersection) || samePoint(s.lastPoint, intersection);
        });
        if (segmentsOfIntersection.length % 2) {
            console.error(segmentsOfIntersection, intersection);
            throw new Error("Bug in the intersection algo on non crossing point");
        }
        const isInside = segmentsOfIntersection.map((segment)=>{
            return blueprintToCheck.isInside(curveMidPoint(segment));
        });
        const segmentsOnTheSameSide = isInside.every((i)=>i) || !isInside.some((i)=>i);
        return !segmentsOnTheSameSide;
    });
}
function blueprintsIntersectionSegments(first, second) {
    let allIntersections = [];
    const allCommonSegments = [];
    const firstCurvePoints = new Array(first.curves.length).fill(0).map(()=>[]);
    const secondCurvePoints = new Array(second.curves.length).fill(0).map(()=>[]);
    first.curves.forEach((thisCurve, firstIndex)=>{
        second.curves.forEach((otherCurve, secondIndex)=>{
            const { intersections, commonSegments, commonSegmentsPoints } = intersectCurves(thisCurve, otherCurve, PRECISION / 100);
            allIntersections.push(...intersections);
            firstCurvePoints[firstIndex].push(...intersections);
            secondCurvePoints[secondIndex].push(...intersections);
            allCommonSegments.push(...commonSegments);
            allIntersections.push(...commonSegmentsPoints);
            firstCurvePoints[firstIndex].push(...commonSegmentsPoints);
            secondCurvePoints[secondIndex].push(...commonSegmentsPoints);
        });
    });
    allIntersections = removeDuplicatePoints(allIntersections, PRECISION);
    if (!allIntersections.length || allIntersections.length === 1) return null;
    const cutCurve = ([curve, intersections])=>{
        if (!intersections.length) return [
            curve
        ];
        return curve.splitAt(intersections, PRECISION / 100);
    };
    let firstCurveSegments = zip([
        first.curves,
        firstCurvePoints
    ]).flatMap(cutCurve);
    let secondCurveSegments = zip([
        second.curves,
        secondCurvePoints
    ]).flatMap(cutCurve);
    const commonSegmentsPoints = allCommonSegments.map((c)=>[
            c.firstPoint,
            c.lastPoint
        ]);
    allIntersections = removeNonCrossingPoint(allIntersections, firstCurveSegments, second);
    if (!allIntersections.length && !allCommonSegments.length) return null;
    if (!allCommonSegments.length) {
        const startAt = allIntersections[0];
        firstCurveSegments = rotateToStartAt(firstCurveSegments, startAt);
        secondCurveSegments = rotateToStartAt(secondCurveSegments, startAt);
    } else {
        const startSegment = allCommonSegments[0];
        firstCurveSegments = rotateToStartAtSegment(firstCurveSegments, startSegment);
        secondCurveSegments = rotateToStartAtSegment(secondCurveSegments, startSegment);
    }
    const firstIntersectedSegments = Array.from(createSegmentOnPoints(firstCurveSegments, allIntersections, allCommonSegments));
    let secondIntersectedSegments = Array.from(createSegmentOnPoints(secondCurveSegments, allIntersections, allCommonSegments));
    if (!samePoint(endOfSegment(secondIntersectedSegments[0]), endOfSegment(firstIntersectedSegments[0])) || allCommonSegments.length > 0 && secondIntersectedSegments[0].length !== 1) {
        secondIntersectedSegments = reverseSegments(secondIntersectedSegments);
    }
    return zip([
        firstIntersectedSegments,
        secondIntersectedSegments
    ]).map(([first, second])=>{
        const currentStart = startOfSegment(first);
        const currentEnd = endOfSegment(first);
        if (commonSegmentsPoints.find(([startPoint, endPoint])=>{
            return samePoint(startPoint, currentStart) && samePoint(endPoint, currentEnd) || samePoint(startPoint, currentEnd) && samePoint(startPoint, currentStart);
        })) {
            return [
                first,
                "same"
            ];
        }
        return [
            first,
            second
        ];
    });
}
const splitPaths = (curves)=>{
    const startPoints = curves.map((c)=>c.firstPoint);
    let endPoints = curves.map((c)=>c.lastPoint);
    endPoints = endPoints.slice(-1).concat(endPoints.slice(0, -1));
    const discontinuities = zip([
        startPoints,
        endPoints
    ]).map(([startPoint, endPoint], index)=>{
        if (!samePoint(startPoint, endPoint)) {
            return index;
        }
        return null;
    }).filter((f)=>f !== null);
    if (!discontinuities.length) return [
        curves
    ];
    const paths = zip([
        discontinuities.slice(0, -1),
        discontinuities.slice(1)
    ]).map(([start, end])=>{
        return curves.slice(start, end);
    });
    let lastPath = curves.slice(discontinuities[discontinuities.length - 1]);
    if (discontinuities[0] !== 0) {
        lastPath = lastPath.concat(curves.slice(0, discontinuities[0]));
    }
    paths.push(lastPath);
    return paths;
};
function booleanOperation(first, second, { firstInside, secondInside }) {
    const segments = blueprintsIntersectionSegments(first, second);
    if (!segments) {
        const firstBlueprintPoint = curveMidPoint(first.curves[0]);
        const firstCurveInSecond = second.isInside(firstBlueprintPoint);
        const secondBlueprintPoint = curveMidPoint(second.curves[0]);
        const secondCurveInFirst = first.isInside(secondBlueprintPoint);
        return {
            identical: false,
            firstCurveInSecond,
            secondCurveInFirst
        };
    }
    if (segments.every(([, secondSegment])=>secondSegment === "same")) {
        return {
            identical: true
        };
    }
    let lastWasSame = null;
    let segmentsIn = null;
    const s = segments.flatMap(([firstSegment, secondSegment])=>{
        let segments = [];
        let segmentsOut = 0;
        if (secondSegment === "same") {
            if (segmentsIn === 1) {
                segmentsIn = 1;
                return [
                    ...firstSegment
                ];
            }
            if (segmentsIn === 2 || segmentsIn === 0) {
                segmentsIn = null;
                return [];
            }
            if (segmentsIn === null) {
                if (!lastWasSame) lastWasSame = firstSegment;
                else lastWasSame = [
                    ...lastWasSame,
                    ...firstSegment
                ];
                return [];
            }
            console.error("weird situation");
            return [];
        }
        const firstSegmentPoint = curveMidPoint(firstSegment[0]);
        const firstSegmentInSecondShape = second.isInside(firstSegmentPoint);
        if (firstInside === "keep" && firstSegmentInSecondShape || firstInside === "remove" && !firstSegmentInSecondShape) {
            segmentsOut += 1;
            segments.push(...firstSegment);
        }
        const secondSegmentPoint = curveMidPoint(secondSegment[0]);
        const secondSegmentInFirstShape = first.isInside(secondSegmentPoint);
        if (secondInside === "keep" && secondSegmentInFirstShape || secondInside === "remove" && !secondSegmentInFirstShape) {
            let segmentsToAdd = secondSegment;
            if (segmentsOut === 1) {
                segmentsToAdd = reverseSegment(secondSegment);
            }
            segmentsOut += 1;
            segments.push(...segmentsToAdd);
        }
        if (segmentsIn === null && segmentsOut === 1 && lastWasSame) {
            segments = [
                ...lastWasSame,
                ...segments
            ];
        }
        if (segmentsOut === 1) {
            segmentsIn = segmentsOut;
            lastWasSame = null;
        }
        return segments;
    });
    const paths = splitPaths(s).filter((b)=>b.length).map((b)=>new Blueprint(b));
    if (paths.length === 0) return null;
    if (paths.length === 1) return paths[0];
    return organiseBlueprints(paths);
}
export const fuseBlueprints = (first, second)=>{
    const result = booleanOperation(first, second, {
        firstInside: "remove",
        secondInside: "remove"
    });
    if (result === null || result instanceof Blueprint || result instanceof Blueprints) return result;
    if (result.identical) {
        return first.clone();
    }
    if (result.firstCurveInSecond) {
        return second.clone();
    }
    if (result.secondCurveInFirst) {
        return first.clone();
    }
    return new Blueprints([
        first,
        second
    ]);
};
export const cutBlueprints = (first, second)=>{
    const result = booleanOperation(first, second, {
        firstInside: "remove",
        secondInside: "keep"
    });
    if (result === null || result instanceof Blueprint || result instanceof Blueprints) return result;
    if (result.identical) {
        return null;
    }
    if (result.firstCurveInSecond) {
        return null;
    }
    if (result.secondCurveInFirst) {
        return new Blueprints([
            new CompoundBlueprint([
                first,
                second
            ])
        ]);
    }
    return first.clone();
};
export const intersectBlueprints = (first, second)=>{
    const result = booleanOperation(first, second, {
        firstInside: "keep",
        secondInside: "keep"
    });
    if (result === null || result instanceof Blueprint || result instanceof Blueprints) return result;
    if (result.identical) {
        return first.clone();
    }
    if (result.firstCurveInSecond) {
        return first.clone();
    }
    if (result.secondCurveInFirst) {
        return second.clone();
    }
    return null;
};
