import { Plane } from "../geom.js";
import { makePlane } from "../geomHelpers.js";

import { PLANE_TO_DIR } from "./definitions.js";
import { Finder3d } from "./generic3dfinder.js";
export class EdgeFinder extends Finder3d {
    clone() {
        const ef = new EdgeFinder();
        ef.filters = [
            ...this.filters
        ];
        return ef;
    }
    inDirection(direction) {
        return this.atAngleWith(direction, 0);
    }
    ofLength(length) {
        const check = ({ element })=>{
            if (typeof length === "number") return Math.abs(element.length - length) < 1e-9;
            return length(element.length);
        };
        this.filters.push(check);
        return this;
    }
    ofCurveType(curveType) {
        const check = ({ element })=>{
            return element.geomType === curveType;
        };
        this.filters.push(check);
        return this;
    }
    parallelTo(plane) {
        if (typeof plane === "string" && PLANE_TO_DIR[plane]) return this.atAngleWith(PLANE_TO_DIR[plane], 90);
        if (typeof plane !== "string" && plane instanceof Plane) return this.atAngleWith(plane.zDir, 90);
        if (typeof plane !== "string" && plane.normalAt) {
            const normal = plane.normalAt();
            this.atAngleWith(normal, 90);
            return this;
        }
        return this;
    }
    inPlane(inputPlane, origin) {
        const plane = inputPlane instanceof Plane ? makePlane(inputPlane) : makePlane(inputPlane, origin);
        this.parallelTo(plane);
        const firstPointInPlane = ({ element })=>{
            const point = element.startPoint;
            const projectedPoint = point.projectToPlane(plane);
            const isSamePoint = point.equals(projectedPoint);
            return isSamePoint;
        };
        this.filters.push(firstPointInPlane);
        return this;
    }
    shouldKeep(element) {
        let normal = null;
        try {
            normal = element.tangentAt().normalized();
        } catch (error) {
            console.error("failed to compute a normal", error);
        }
        return this.filters.every((filter)=>filter({
                normal,
                element
            }));
    }
    applyFilter(shape) {
        return shape.edges.filter((edge)=>{
            const shouldKeep = this.shouldKeep(edge);
            return shouldKeep;
        });
    }
}
