import { intersectCurves, stitchCurves, make2dOffset, Curve2D, samePoint as defaultSamePoint, make2dSegmentCurve, squareDistance2d, make2dArcFromCenter, add2d, subtract2d, determinant2x2 } from "../lib2d/index.js";
import { Blueprint, Blueprints, CompoundBlueprint, fuse2D, cut2D } from "./index.js";
const PRECISION = 1e-8;
const samePoint = (x, y)=>defaultSamePoint(x, y, PRECISION * 10);
const getIntersectionPoint = (line1Start, line1End, line2Start, line2End)=>{
    const x = determinant2x2([
        [
            determinant2x2([
                [
                    line1Start[0],
                    line1Start[1]
                ],
                [
                    line1End[0],
                    line1End[1]
                ]
            ]),
            determinant2x2([
                [
                    line1Start[0],
                    1
                ],
                [
                    line1End[0],
                    1
                ]
            ])
        ],
        [
            determinant2x2([
                [
                    line2Start[0],
                    line2Start[1]
                ],
                [
                    line2End[0],
                    line2End[1]
                ]
            ]),
            determinant2x2([
                [
                    line2Start[0],
                    1
                ],
                [
                    line2End[0],
                    1
                ]
            ])
        ]
    ]) / determinant2x2([
        [
            determinant2x2([
                [
                    line1Start[0],
                    1
                ],
                [
                    line1End[0],
                    1
                ]
            ]),
            determinant2x2([
                [
                    line1Start[1],
                    1
                ],
                [
                    line1End[1],
                    1
                ]
            ])
        ],
        [
            determinant2x2([
                [
                    line2Start[0],
                    1
                ],
                [
                    line2End[0],
                    1
                ]
            ]),
            determinant2x2([
                [
                    line2Start[1],
                    1
                ],
                [
                    line2End[1],
                    1
                ]
            ])
        ]
    ]);
    const y = determinant2x2([
        [
            determinant2x2([
                [
                    line1Start[0],
                    line1Start[1]
                ],
                [
                    line1End[0],
                    line1End[1]
                ]
            ]),
            determinant2x2([
                [
                    line1Start[1],
                    1
                ],
                [
                    line1End[1],
                    1
                ]
            ])
        ],
        [
            determinant2x2([
                [
                    line2Start[0],
                    line2Start[1]
                ],
                [
                    line2End[0],
                    line2End[1]
                ]
            ]),
            determinant2x2([
                [
                    line2Start[1],
                    1
                ],
                [
                    line2End[1],
                    1
                ]
            ])
        ]
    ]) / determinant2x2([
        [
            determinant2x2([
                [
                    line1Start[0],
                    1
                ],
                [
                    line1End[0],
                    1
                ]
            ]),
            determinant2x2([
                [
                    line1Start[1],
                    1
                ],
                [
                    line1End[1],
                    1
                ]
            ])
        ],
        [
            determinant2x2([
                [
                    line2Start[0],
                    1
                ],
                [
                    line2End[0],
                    1
                ]
            ]),
            determinant2x2([
                [
                    line2Start[1],
                    1
                ],
                [
                    line2End[1],
                    1
                ]
            ])
        ]
    ]);
    return [
        x,
        y
    ];
};
function joinRound(appendCurve, previousLastPoint, firstPoint, previousCurve, _curve) {
    const arcJoiner = make2dArcFromCenter(previousLastPoint, firstPoint, previousCurve.original.lastPoint);
    appendCurve(previousCurve);
    appendCurve(arcJoiner);
}
function joinBevel(appendCurve, previousLastPoint, firstPoint, previousCurve, _curve) {
    const bevelJoiner = make2dSegmentCurve(previousLastPoint, firstPoint);
    appendCurve(previousCurve);
    appendCurve(bevelJoiner);
}
function joinMiter(appendCurve, previousLastPoint, firstPoint, previousCurve, curve) {
    const previousOtherPoint = previousCurve.offset instanceof Curve2D ? subtract2d(previousLastPoint, previousCurve.offset.tangentAt(1)) : previousCurve.offset.firstPoint;
    const nextOtherPoint = curve.offset instanceof Curve2D ? add2d(firstPoint, curve.offset.tangentAt(0)) : curve.offset.lastPoint;
    const offsetIntersectionPoint = getIntersectionPoint(previousOtherPoint, previousLastPoint, firstPoint, nextOtherPoint);
    const miterJoiner1 = make2dSegmentCurve(previousLastPoint, offsetIntersectionPoint);
    const miterJoiner2 = make2dSegmentCurve(offsetIntersectionPoint, firstPoint);
    appendCurve(previousCurve);
    appendCurve(miterJoiner1);
    appendCurve(miterJoiner2);
}
const OFFSET_JOINERS = {
    round: joinRound,
    bevel: joinBevel,
    miter: joinMiter
};
export function rawOffsets(blueprint, offset, offsetConfig = {}) {
    const correctedOffset = blueprint.orientation === "clockwise" ? -offset : offset;
    const offsetCurves = blueprint.curves.map((c)=>({
            offset: make2dOffset(c, correctedOffset),
            original: c
        }));
    const offsettedArray = [];
    let savedLastCurve = null;
    let previousCurve = offsetCurves.at(-1);
    if (!previousCurve) return [];
    if (offsettedArray.length === 1) return offsettedArray;
    function appendCurve(curve) {
        if (curve instanceof Curve2D) {
            offsettedArray.push(curve);
            return;
        }
        if (!savedLastCurve) {
            savedLastCurve = curve;
        } else if (curve.offset instanceof Curve2D) {
            offsettedArray.push(curve.offset);
        } else if (!samePoint(curve.offset.firstPoint, curve.offset.lastPoint)) {
            offsettedArray.push(make2dSegmentCurve(curve.offset.firstPoint, curve.offset.lastPoint));
        }
    }
    const iterateOffsetCurves = function*() {
        for (const curve of offsetCurves.slice(0, -1)){
            yield curve;
        }
        if (!savedLastCurve) throw new Error("Bug in the offset algorithm");
        yield savedLastCurve;
    };
    for (const curve of iterateOffsetCurves()){
        const previousLastPoint = previousCurve.offset.lastPoint;
        const firstPoint = curve.offset.firstPoint;
        if (samePoint(previousLastPoint, firstPoint)) {
            appendCurve(previousCurve);
            previousCurve = curve;
            continue;
        }
        let intersections = [];
        if (previousCurve.offset instanceof Curve2D && curve.offset instanceof Curve2D) {
            const { intersections: pointIntersections, commonSegmentsPoints } = intersectCurves(previousCurve.offset, curve.offset, PRECISION / 100);
            intersections = [
                ...pointIntersections,
                ...commonSegmentsPoints
            ];
        }
        if (intersections.length > 0) {
            let intersection = intersections[0];
            if (intersections.length > 1) {
                const originalEndpoint = previousCurve?.original.lastPoint;
                const distances = intersections.map((i)=>squareDistance2d(i, originalEndpoint));
                intersection = intersections[distances.indexOf(Math.min(...distances))];
            }
            const splitPreviousCurve = previousCurve.offset.splitAt([
                intersection
            ], PRECISION)[0];
            const splitCurve = curve.offset.splitAt([
                intersection
            ], PRECISION).at(-1);
            if (!splitCurve) throw new Error("Bug in the splitting algo in offset");
            appendCurve({
                offset: splitPreviousCurve,
                original: previousCurve.original
            });
            previousCurve = {
                offset: splitCurve,
                original: curve.original
            };
            continue;
        }
        const joiner = OFFSET_JOINERS[offsetConfig.lineJoinType ?? "round"];
        joiner(appendCurve, previousLastPoint, firstPoint, previousCurve, curve);
        previousCurve = curve;
    }
    appendCurve(previousCurve);
    return offsettedArray;
}
export function offsetBlueprint(blueprint, offset, offsetConfig = {}) {
    const offsettedArray = rawOffsets(blueprint, offset, offsetConfig);
    if (offsettedArray.length < 2) return null;
    const allIntersections = new Map();
    const updateIntersections = (index, newPoints)=>{
        const intersections = allIntersections.get(index) || [];
        allIntersections.set(index, [
            ...intersections,
            ...newPoints
        ]);
    };
    offsettedArray.forEach((firstCurve, firstIndex)=>{
        offsettedArray.slice(firstIndex + 1).forEach((secondCurve, secondIndex)=>{
            const { intersections: rawIntersections, commonSegmentsPoints } = intersectCurves(firstCurve, secondCurve, PRECISION);
            const intersections = [
                ...rawIntersections,
                ...commonSegmentsPoints
            ].filter((intersection)=>{
                const onFirstCurveExtremity = samePoint(intersection, firstCurve.firstPoint) || samePoint(intersection, firstCurve.lastPoint);
                const onSecondCurveExtremity = samePoint(intersection, secondCurve.firstPoint) || samePoint(intersection, secondCurve.lastPoint);
                return !(onFirstCurveExtremity && onSecondCurveExtremity);
            });
            if (!intersections.length) return;
            updateIntersections(firstIndex, intersections);
            updateIntersections(secondIndex + firstIndex + 1, intersections);
        });
    });
    if (!allIntersections.size) {
        const offsettedBlueprint = new Blueprint(offsettedArray);
        if (!blueprint.intersects(offsettedBlueprint)) return offsettedBlueprint;
        return null;
    }
    const splitCurves = offsettedArray.flatMap((curve, index)=>{
        if (!allIntersections.has(index)) return curve;
        const intersections = allIntersections.get(index) || [];
        const splitCurves = curve.splitAt(intersections, PRECISION * 100);
        return splitCurves;
    });
    const prunedCurves = splitCurves.filter((curve)=>{
        const closeCurve = blueprint.curves.find((c)=>c.distanceFrom(curve) < Math.abs(offset) - PRECISION);
        return !closeCurve;
    });
    if (!prunedCurves.length) return null;
    const curvesGrouped = stitchCurves(prunedCurves);
    const blueprints = curvesGrouped.filter((c)=>c.length > 1).map((c)=>new Blueprint(c)).filter((b)=>b.isClosed());
    if (!blueprints.length) return null;
    if (blueprints.length === 1) {
        return blueprints[0];
    }
    return new Blueprints(blueprints);
}
const fuseAll = (blueprints)=>{
    let fused = blueprints[0];
    for(let i = 1; i < blueprints.length; i++){
        fused = fuse2D(fused, blueprints[i]);
    }
    return fused;
};
export default function offset(bp, offsetDistance, offsetConfig = {}) {
    if (bp instanceof Blueprint) {
        return offsetBlueprint(bp, offsetDistance, offsetConfig);
    } else if (bp instanceof Blueprints) {
        return fuseAll(bp.blueprints.map((b)=>offset(b, offsetDistance, offsetConfig)));
    } else if (bp instanceof CompoundBlueprint) {
        const innerShape = fuseAll(bp.blueprints.slice(1).map((b)=>offset(b, offsetDistance, offsetConfig)));
        return cut2D(offset(bp.blueprints[0], offsetDistance, offsetConfig), innerShape);
    }
    return null;
}
