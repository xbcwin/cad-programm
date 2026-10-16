
export const combineFinderFilters = (filters)=>{
    const filter = (element)=>{
        for (const { filter, radius } of filters){
            if (filter.shouldKeep(element)) return radius;
        }
        return null;
    };
    return [
        filter,
        ()=>filters.forEach((f)=>f.filter.delete())
    ];
};
export * from "./edgeFinder.js";
export * from "./faceFinder.js";
export * from "./cornerFinder.js";
export * from "./helpers.js";
