



import Blueprint from "./Blueprint.js";
import Blueprints from "./Blueprints.js";
import CompoundBlueprint from "./CompoundBlueprint.js";

import Sketches from "../sketches/Sketches.js";
const groupByBoundingBoxOverlap = (blueprints)=>{
    const overlaps = blueprints.map((blueprint, i)=>{
        return blueprints.slice(i + 1).map((v, j)=>[
                j + i + 1,
                v
            ]).filter(([, other])=>!blueprint.boundingBox.isOut(other.boundingBox)).map(([index])=>index);
    });
    const groups = [];
    const groupsInOverlaps = Array(overlaps.length);
    overlaps.forEach((indices, i)=>{
        let myGroup = groupsInOverlaps[i];
        if (!myGroup) {
            myGroup = [];
            groups.push(myGroup);
        }
        myGroup.push(blueprints[i]);
        if (indices.length) {
            indices.forEach((index)=>{
                groupsInOverlaps[index] = myGroup;
            });
        }
    });
    return groups;
};
const addContainmentInfo = (groupedBlueprints)=>{
    return groupedBlueprints.map((blueprint, index)=>{
        const firstCurve = blueprint.curves[0];
        const point = firstCurve.value((firstCurve.lastParameter + firstCurve.firstParameter) / 2);
        const isIn = groupedBlueprints.filter((potentialOuterBlueprint, j)=>{
            if (index === j) return false;
            return potentialOuterBlueprint.isInside(point);
        });
        return {
            blueprint,
            isIn
        };
    });
};
const splitMultipleOuterBlueprints = (outerBlueprints, allBlueprints)=>{
    return outerBlueprints.flatMap(({ blueprint: outerBlueprint })=>{
        return cleanEdgeCases(allBlueprints.filter(({ blueprint, isIn })=>blueprint === outerBlueprint || isIn.indexOf(outerBlueprint) !== -1));
    });
};
const handleNestedBlueprints = (nestedBlueprints, allBlueprints)=>{
    const firstLevelOuterBlueprints = allBlueprints.filter(({ isIn })=>isIn.length <= 1);
    const innerLevelsBlueprints = cleanEdgeCases(addContainmentInfo(nestedBlueprints.map(({ blueprint })=>blueprint)));
    return [
        firstLevelOuterBlueprints,
        ...innerLevelsBlueprints
    ];
};
const cleanEdgeCases = (groupedBlueprints)=>{
    if (!groupedBlueprints.length) return [];
    const outerBlueprints = groupedBlueprints.filter(({ isIn })=>!isIn.length);
    const nestedBlueprints = groupedBlueprints.filter(({ isIn })=>isIn.length > 1);
    if (outerBlueprints.length === 1 && nestedBlueprints.length === 0) {
        return [
            groupedBlueprints
        ];
    } else if (outerBlueprints.length > 1) {
        return splitMultipleOuterBlueprints(outerBlueprints, groupedBlueprints);
    } else {
        return handleNestedBlueprints(nestedBlueprints, groupedBlueprints);
    }
};
export const organiseBlueprints = (blueprints)=>{
    const basicGrouping = groupByBoundingBoxOverlap(blueprints).map(addContainmentInfo);
    return new Blueprints(basicGrouping.flatMap(cleanEdgeCases).map((compounds)=>{
        if (compounds.length === 1) return compounds[0].blueprint;
        compounds.sort((a, b)=>a.isIn.length - b.isIn.length);
        return new CompoundBlueprint(compounds.map(({ blueprint })=>blueprint));
    }));
};
