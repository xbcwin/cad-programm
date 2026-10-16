
import { DEG2RAD } from "../constants.js";
import { angle2d, distance2d, samePoint } from "../lib2d/index.js";
import { Finder } from "./definitions.js";
const blueprintCorners = function(blueprint) {
    return blueprint.curves.map((curve, index)=>{
        return {
            firstCurve: curve,
            secondCurve: blueprint.curves[(index + 1) % blueprint.curves.length],
            point: curve.lastPoint
        };
    });
};
const PI_2 = 2 * Math.PI;
const positiveHalfAngle = (angle)=>{
    const limitedAngle = angle % PI_2;
    const coterminalAngle = limitedAngle < 0 ? limitedAngle + PI_2 : limitedAngle;
    if (coterminalAngle < Math.PI) return coterminalAngle;
    if (coterminalAngle === Math.PI) return 0;
    return Math.abs(coterminalAngle - PI_2);
};
export class CornerFinder extends Finder {
    clone() {
        const ef = new CornerFinder();
        ef.filters = [
            ...this.filters
        ];
        return ef;
    }
    inList(elementList) {
        const elementInList = ({ element })=>{
            return !!elementList.find((e)=>samePoint(e, element.point));
        };
        this.filters.push(elementInList);
        return this;
    }
    atDistance(distance, point = [
        0,
        0
    ]) {
        function elementAtDistance({ element }) {
            return Math.abs(distance2d(point, element.point) - distance) < 1e-9;
        }
        this.filters.push(elementAtDistance);
        return this;
    }
    atPoint(point) {
        function elementAtPoint({ element }) {
            return samePoint(point, element.point);
        }
        this.filters.push(elementAtPoint);
        return this;
    }
    inBox(corner1, corner2) {
        const [x1, y1] = corner1;
        const [x2, y2] = corner2;
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        function elementInBox({ element }) {
            const [x, y] = element.point;
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        }
        this.filters.push(elementInBox);
        return this;
    }
    ofAngle(angle) {
        function elementOfAngle({ element }) {
            const tgt1 = element.firstCurve.tangentAt(1);
            const tgt2 = element.secondCurve.tangentAt(0);
            return Math.abs(positiveHalfAngle(angle2d(tgt1, tgt2)) - positiveHalfAngle(DEG2RAD * angle)) < 1e-9;
        }
        this.filters.push(elementOfAngle);
        return this;
    }
    shouldKeep(element) {
        const shouldKeep = this.filters.every((filter)=>filter({
                normal: null,
                element
            }));
        return shouldKeep;
    }
    applyFilter(blueprint) {
        return blueprintCorners(blueprint).filter((corner)=>{
            const shouldKeep = this.shouldKeep(corner);
            return shouldKeep;
        });
    }
}
