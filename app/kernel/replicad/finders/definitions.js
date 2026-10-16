

export const PLANE_TO_DIR = {
    YZ: "X",
    XZ: "Y",
    XY: "Z"
};
export class Finder {
    filters;
    constructor(){
        this.filters = [];
    }
    delete() {
        this.filters = [];
    }
    and(findersList) {
        findersList.forEach((f)=>f(this));
        return this;
    }
    not(finderFun) {
        const finder = new this.constructor();
        finderFun(finder);
        const notFilter = ({ element })=>!finder.shouldKeep(element);
        this.filters.push(notFilter);
        return this;
    }
    either(findersList) {
        const builtFinders = findersList.map((finderFunction)=>{
            const finder = new this.constructor();
            finderFunction(finder);
            return finder;
        });
        const eitherFilter = ({ element })=>builtFinders.some((finder)=>finder.shouldKeep(element));
        this.filters.push(eitherFilter);
        return this;
    }
    find(shape, { unique = false } = {}) {
        const elements = this.applyFilter(shape);
        if (unique) {
            if (elements.length !== 1) {
                console.error(elements);
                throw new Error("Finder has not found a unique solution");
            }
            return elements[0];
        }
        return elements;
    }
}
