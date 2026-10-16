import { Face } from "../shapes.js";
import { FaceFinder } from "./faceFinder.js";
export function getSingleFace(f, shape) {
    if (f instanceof Face) return f;
    const finder = f instanceof FaceFinder ? f : f(new FaceFinder(), shape);
    return finder.find(shape, {
        unique: true
    });
}
const AXIS_INDEX = {
    X: 0,
    Y: 1,
    Z: 2
};
export const atShapeExtremum = (shape, axis, extremum, tolerance = 1e-6)=>{
    const axisIndex = AXIS_INDEX[axis];
    const boundIndex = extremum === "min" ? 0 : 1;
    const shapeBox = shape.boundingBox;
    const shapeExtreme = shapeBox.bounds[boundIndex][axisIndex];
    shapeBox.delete();
    return ({ element })=>{
        const elementBox = element.boundingBox;
        const elementExtreme = elementBox.bounds[boundIndex][axisIndex];
        elementBox.delete();
        return Math.abs(elementExtreme - shapeExtreme) <= tolerance;
    };
};
export const topMost = (shape, tolerance = 1e-6)=>atShapeExtremum(shape, "Z", "max", tolerance);
export const bottomMost = (shape, tolerance = 1e-6)=>atShapeExtremum(shape, "Z", "min", tolerance);
export const leftMost = (shape, tolerance = 1e-6)=>atShapeExtremum(shape, "X", "min", tolerance);
export const rightMost = (shape, tolerance = 1e-6)=>atShapeExtremum(shape, "X", "max", tolerance);
export const frontMost = (shape, tolerance = 1e-6)=>atShapeExtremum(shape, "Y", "max", tolerance);
export const backMost = (shape, tolerance = 1e-6)=>atShapeExtremum(shape, "Y", "min", tolerance);
