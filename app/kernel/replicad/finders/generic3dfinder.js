import { Finder } from "./definitions.js";
import { makeDirVector } from "../geom.js";
import { DEG2RAD } from "../constants.js";

import { makeBox, makeVertex } from "../shapeHelpers.js";
import { DistanceQuery } from "../measureShape.js";
export class Finder3d extends Finder {
    when(filter) {
        this.filters.push(filter);
        return this;
    }
    inList(elementList) {
        const elementInList = ({ element })=>{
            return !!elementList.find((e)=>e.isSame(element));
        };
        this.filters.push(elementInList);
        return this;
    }
    atAngleWith(direction = "Z", angle = 0) {
        const myDirection = makeDirVector(direction);
        const checkAngle = ({ normal })=>{
            if (!normal) return false;
            const angleOfNormal = Math.acos(Math.abs(normal.dot(myDirection)));
            return Math.abs(angleOfNormal - DEG2RAD * angle) < 1e-6;
        };
        this.filters.push(checkAngle);
        return this;
    }
    atDistance(distance, point = [
        0,
        0,
        0
    ], tolerance = 1e-6) {
        const vertex = makeVertex(point);
        const query = new DistanceQuery(vertex);
        const checkPoint = ({ element })=>{
            return Math.abs(query.distanceTo(element) - distance) < tolerance;
        };
        this.filters.push(checkPoint);
        return this;
    }
    containsPoint(point) {
        return this.near(point);
    }
    near(point, tolerance = 1e-6) {
        return this.atDistance(0, point, tolerance);
    }
    withinDistance(distance, point = [
        0,
        0,
        0
    ]) {
        const vertex = makeVertex(point);
        const query = new DistanceQuery(vertex);
        const checkPoint = ({ element })=>{
            return query.distanceTo(element) - distance < 1e-6;
        };
        this.filters.push(checkPoint);
        return this;
    }
    inBox(corner1, corner2) {
        const box = makeBox(corner1, corner2);
        return this.inShape(box);
    }
    inShape(shape) {
        const query = new DistanceQuery(shape);
        const checkPoint = ({ element })=>{
            return query.distanceTo(element) < 1e-6;
        };
        this.filters.push(checkPoint);
        return this;
    }
}
