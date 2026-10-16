import Blueprint from "./Blueprint.js";
import Blueprints from "./Blueprints.js";
import CompoundBlueprint from "./CompoundBlueprint.js";
import { organiseBlueprints } from "./lib.js";
import { fuseBlueprints, cutBlueprints, intersectBlueprints } from "./booleanOperations.js";
import { intersectCurves, removeDuplicatePoints } from "../lib2d/index.js";
const genericIntersects = (first, second)=>{
    if (first instanceof Blueprint && second instanceof Blueprint) {
        let allIntersections = [];
        first.curves.forEach((thisCurve)=>{
            second.curves.forEach((otherCurve)=>{
                const { intersections, commonSegmentsPoints } = intersectCurves(thisCurve, otherCurve);
                allIntersections.push(...intersections);
                allIntersections.push(...commonSegmentsPoints);
            });
        });
        allIntersections = removeDuplicatePoints(allIntersections);
        return allIntersections.length > 1;
    }
    if (first instanceof CompoundBlueprint || first instanceof Blueprints) {
        return first.blueprints.some((bp)=>genericIntersects(bp, second));
    }
    if (second instanceof CompoundBlueprint || second instanceof Blueprints) {
        return second.blueprints.some((bp)=>genericIntersects(first, bp));
    }
    throw new Error("Bug in the generic intersects algorithm");
};
const genericFuse = (first, second)=>{
    if (first instanceof CompoundBlueprint) {
        if (second instanceof Blueprint) {
            return fuseBlueprintWithCompound(second, first);
        }
        if (second instanceof CompoundBlueprint) {
            return fuseCompoundWithCompound(first, second);
        }
    }
    if (second instanceof CompoundBlueprint) {
        if (first instanceof Blueprint) {
            return fuseBlueprintWithCompound(first, second);
        }
        if (first instanceof CompoundBlueprint) {
            return fuseCompoundWithCompound(first, second);
        }
    }
    if (first instanceof Blueprint && second instanceof Blueprint) {
        return fuseBlueprints(first, second);
    }
    throw new Error("Bug in the generic fuse algorithm");
};
const fuseIntersectingBlueprints = (blueprints)=>{
    const fused = new Map();
    const output = [];
    blueprints.forEach((inputBlueprint, i)=>{
        let savedBlueprint;
        if (fused.has(i)) {
            savedBlueprint = fused.get(i);
        } else {
            savedBlueprint = {
                current: inputBlueprint,
                fusedWith: new Set([
                    i
                ])
            };
            output.push(savedBlueprint);
        }
        blueprints.slice(i + 1).forEach((inputOtherBlueprint, j)=>{
            const blueprint = savedBlueprint.current;
            const currentIndex = i + j + 1;
            if (savedBlueprint.fusedWith.has(currentIndex)) return;
            let otherBlueprint = inputOtherBlueprint;
            let otherIsFused = false;
            if (fused.has(currentIndex)) {
                otherBlueprint = fused.get(currentIndex).current;
                otherIsFused = true;
            }
            if (blueprint.boundingBox.isOut(otherBlueprint.boundingBox)) return;
            if (!genericIntersects(blueprint, otherBlueprint)) return;
            let newFused;
            if (blueprint instanceof Blueprints || otherBlueprint instanceof Blueprints) {
                newFused = fuse2D(blueprint, otherBlueprint);
            } else {
                newFused = genericFuse(blueprint, otherBlueprint);
            }
            if (!(newFused instanceof Blueprint || newFused instanceof CompoundBlueprint)) {
                if (newFused instanceof Blueprints && newFused.blueprints.length === 2) {
                    return;
                } else if (newFused instanceof Blueprints && newFused.blueprints.length === 1) {
                    newFused = newFused.blueprints[0];
                } else if (!(newFused instanceof Blueprints)) {
                    console.error(newFused);
                    throw new Error("Bug in blueprint fusing algorigthm");
                }
            }
            savedBlueprint.fusedWith.add(currentIndex);
            savedBlueprint.current = newFused;
            if (!otherIsFused) fused.set(currentIndex, savedBlueprint);
        });
    });
    return organiseBlueprints(output.map(({ current })=>current).filter((a)=>a).flatMap((b)=>allBlueprints(b)));
};
const allBlueprints = (shape)=>{
    if (shape instanceof Blueprint) return [
        shape
    ];
    if (shape instanceof CompoundBlueprint) return shape.blueprints;
    if (shape instanceof Blueprints) return shape.blueprints.flatMap((b)=>allBlueprints(b));
    return [];
};
const fuseBlueprintWithCompound = (blueprint, compound)=>{
    const outerFused = fuseBlueprints(blueprint, compound.blueprints[0]);
    const innerFused = compound.blueprints.slice(1).map((c)=>cutBlueprints(c, blueprint));
    return organiseBlueprints([
        ...allBlueprints(outerFused),
        ...innerFused.flatMap((fused)=>allBlueprints(fused))
    ]);
};
function allPairs(list1, list2) {
    const result = [];
    for (const l1 of list1){
        for (const l2 of list2){
            result.push([
                l1,
                l2
            ]);
        }
    }
    return result;
}
const fuseCompoundWithCompound = (first, second)=>{
    const outerFused = fuseBlueprints(first.blueprints[0], second.blueprints[0]);
    const inner1Fused = second.blueprints.slice(1).map((c)=>cutBlueprints(c, first.blueprints[0]));
    const inner2Fused = first.blueprints.slice(1).map((c)=>cutBlueprints(c, second.blueprints[0]));
    const innerIntersections = allPairs(first.blueprints.slice(1), second.blueprints.slice(1)).flatMap(([first, second])=>{
        return allBlueprints(intersectBlueprints(first, second));
    });
    return organiseBlueprints([
        ...allBlueprints(outerFused),
        ...inner1Fused.flatMap((fused)=>allBlueprints(fused)),
        ...inner2Fused.flatMap((fused)=>allBlueprints(fused)),
        ...innerIntersections
    ]);
};
export const fuse2D = (first, second)=>{
    if (first === null) {
        return second && second.clone();
    }
    if (second === null) {
        return first && first.clone();
    }
    if (!(first instanceof Blueprints) && second instanceof Blueprints) {
        return fuseIntersectingBlueprints([
            first,
            ...second.blueprints
        ]);
    }
    if (!(second instanceof Blueprints) && first instanceof Blueprints) {
        return fuseIntersectingBlueprints([
            second,
            ...first.blueprints
        ]);
    }
    if (first instanceof Blueprints && second instanceof Blueprints) {
        let out = fuse2D(first.blueprints[0], second);
        first.blueprints.slice(1).forEach((bp)=>{
            out = fuse2D(bp, out);
        });
        return out;
    }
    if (first instanceof CompoundBlueprint) {
        if (second instanceof Blueprints) {
            return fuse2D(second, first);
        }
        if (second instanceof Blueprint) {
            return fuseBlueprintWithCompound(second, first);
        }
        if (second instanceof CompoundBlueprint) {
            return fuseCompoundWithCompound(first, second);
        }
    }
    if (second instanceof CompoundBlueprint) {
        if (first instanceof Blueprints) {
            return fuse2D(first, second);
        }
        if (first instanceof Blueprint) {
            return fuseBlueprintWithCompound(first, second);
        }
        if (first instanceof CompoundBlueprint) {
            return fuseCompoundWithCompound(first, second);
        }
    }
    if (first instanceof Blueprint && second instanceof Blueprint) {
        return fuseBlueprints(first, second);
    }
    return null;
};
const mergeNonIntersecting = (shapes)=>{
    const exploded = shapes.flatMap((s)=>{
        if (s === null) return [];
        if (s instanceof Blueprints) return s.blueprints;
        return s;
    });
    if (exploded.length === 1) return exploded[0];
    return new Blueprints(exploded);
};
export const cut2D = (first, second)=>{
    if (first === null) {
        return null;
    }
    if (second === null) {
        return first.clone();
    }
    if (first instanceof Blueprints) {
        return mergeNonIntersecting(first.blueprints.map((bp)=>cut2D(bp, second)));
    }
    if (first instanceof CompoundBlueprint) {
        const wrapper = first.blueprints[0];
        if (second instanceof Blueprint && !second.intersects(wrapper)) {
            if (!wrapper.isInside(second.firstPoint)) return null;
            const cuts = fuse2D(second, new Blueprints(first.blueprints.slice(1)));
            return organiseBlueprints([
                wrapper,
                ...allBlueprints(cuts)
            ]);
        } else {
            let out = cut2D(first.blueprints[0], second);
            first.blueprints.slice(1).forEach((bp)=>{
                out = cut2D(out, bp);
            });
            return out;
        }
    }
    if (second instanceof Blueprints) {
        return mergeNonIntersecting(second.blueprints.map((bp)=>cut2D(first, bp)));
    }
    if (second instanceof CompoundBlueprint) {
        let out = cutBlueprints(first, second.blueprints[0]);
        second.blueprints.slice(1).forEach((bp)=>{
            out = fuse2D(out, intersectBlueprints(bp, first));
        });
        return out;
    }
    const singleCut = cutBlueprints(first, second);
    return singleCut;
};
export function intersect2D(first, second) {
    if (first === null || second === null) {
        return null;
    }
    if (first instanceof Blueprint && second instanceof Blueprint) {
        return intersectBlueprints(first, second);
    }
    if (first instanceof Blueprints) {
        return mergeNonIntersecting(first.blueprints.map((bp)=>intersect2D(bp, second)));
    }
    if (first instanceof CompoundBlueprint) {
        const wrapper = first.blueprints[0];
        const cut = first.blueprints[1];
        return cut2D(intersect2D(wrapper, second), cut);
    }
    if (second instanceof Blueprints) {
        return mergeNonIntersecting(second.blueprints.map((bp)=>intersect2D(first, bp)));
    }
    if (second instanceof CompoundBlueprint) {
        const wrapper = second.blueprints[0];
        const cut = second.blueprints[1];
        return cut2D(intersect2D(wrapper, first), cut);
    }
    throw new Error("intersct 2D algorithm error");
}
