import { Plane } from "../geom.js";
import { makePlane } from "../geomHelpers.js";

import { PLANE_TO_DIR } from "./definitions.js";
import { Finder3d } from "./generic3dfinder.js";
export class FaceFinder extends Finder3d {
    clone() {
        const ff = new FaceFinder();
        ff.filters = [
            ...this.filters
        ];
        return ff;
    }
    parallelTo(plane) {
        if (typeof plane === "string" && PLANE_TO_DIR[plane]) return this.atAngleWith(PLANE_TO_DIR[plane]);
        if (typeof plane !== "string" && plane instanceof Plane) return this.atAngleWith(plane.zDir);
        if (typeof plane !== "string" && plane.normalAt) {
            const normal = plane.normalAt();
            this.atAngleWith(normal);
            return this;
        }
        return this;
    }
    ofSurfaceType(surfaceType) {
        const check = ({ element })=>{
            return element.geomType === surfaceType;
        };
        this.filters.push(check);
        return this;
    }
    inPlane(inputPlane, origin) {
        const plane = inputPlane instanceof Plane ? makePlane(inputPlane) : makePlane(inputPlane, origin);
        this.parallelTo(plane);
        const centerInPlane = ({ element })=>{
            const point = element.center;
            const projectedPoint = point.projectToPlane(plane);
            const isSamePoint = point.equals(projectedPoint);
            return isSamePoint;
        };
        this.filters.push(centerInPlane);
        return this;
    }
    shouldKeep(element) {
        const normal = element.normalAt();
        const shouldKeep = this.filters.every((filter)=>filter({
                normal,
                element
            }));
        return shouldKeep;
    }
    applyFilter(shape) {
        return shape.faces.filter((face)=>{
            const shouldKeep = this.shouldKeep(face);
            return shouldKeep;
        });
    }
}
