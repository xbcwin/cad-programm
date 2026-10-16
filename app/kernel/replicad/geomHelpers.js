import { createNamedPlane, Plane, Transformation, Vector } from "./geom.js";


export const makePlaneFromFace = (face, originOnSurface = [
    0,
    0
])=>{
    const originPoint = face.pointOnSurface(...originOnSurface);
    const normal = face.normalAt(originPoint);
    const v = new Vector([
        0,
        0,
        1
    ]);
    let xd = v.cross(normal);
    if (xd.Length < 1e-8) {
        xd.delete();
        xd = new Vector([
            1,
            0,
            0
        ]);
    }
    v.delete();
    return new Plane(originPoint, xd, normal);
};
function makePlane(plane = "XY", origin = [
    0,
    0,
    0
]) {
    if (plane instanceof Plane) {
        return plane.clone();
    } else {
        return createNamedPlane(plane, origin);
    }
}
export { makePlane };
export function rotate(shape, angle, position = [
    0,
    0,
    0
], direction = [
    0,
    0,
    1
]) {
    const transformation = new Transformation();
    transformation.rotate(angle, position, direction);
    const newShape = transformation.transform(shape);
    transformation.delete();
    return newShape;
}
export function translate(shape, vector) {
    const transformation = new Transformation();
    transformation.translate(vector);
    const newShape = transformation.transform(shape);
    transformation.delete();
    return newShape;
}
export function mirror(shape, inputPlane, origin) {
    const transformation = new Transformation();
    transformation.mirror(inputPlane, origin);
    const newShape = transformation.transform(shape);
    transformation.delete();
    return newShape;
}
export function scale(shape, center, scale) {
    const transformation = new Transformation();
    transformation.scale(center, scale);
    const newShape = transformation.transform(shape);
    transformation.delete();
    return newShape;
}
