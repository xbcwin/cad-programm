import { getOC } from "./oclib.js";

import { GCWithScope, WrappingObj } from "./register.js";
class PhysicalProperties extends WrappingObj {
    get centerOfMass() {
        const r = GCWithScope();
        const pnt = r(this.wrapped.CentreOfMass());
        return [
            pnt.X(),
            pnt.Y(),
            pnt.Z()
        ];
    }
}
export class VolumePhysicalProperties extends PhysicalProperties {
    get volume() {
        return this.wrapped.Mass();
    }
}
export class SurfacePhysicalProperties extends PhysicalProperties {
    get area() {
        return this.wrapped.Mass();
    }
}
export class LinearPhysicalProperties extends PhysicalProperties {
    get length() {
        return this.wrapped.Mass();
    }
}
export function measureShapeSurfaceProperties(shape) {
    const oc = getOC();
    const properties = new oc.GProp_GProps();
    oc.BRepGProp.SurfaceProperties(shape.wrapped, properties, false, false);
    return new SurfacePhysicalProperties(properties);
}
export function measureShapeLinearProperties(shape) {
    const oc = getOC();
    const properties = new oc.GProp_GProps();
    oc.BRepGProp.LinearProperties(shape.wrapped, properties, false, false);
    return new LinearPhysicalProperties(properties);
}
export function measureShapeVolumeProperties(shape) {
    const oc = getOC();
    const properties = new oc.GProp_GProps();
    oc.BRepGProp.VolumeProperties(shape.wrapped, properties, false, false, false);
    return new VolumePhysicalProperties(properties);
}
export function measureVolume(shape) {
    return measureShapeVolumeProperties(shape).volume;
}
export function measureArea(shape) {
    return measureShapeSurfaceProperties(shape).area;
}
export function measureLength(shape) {
    return measureShapeLinearProperties(shape).length;
}
export class DistanceTool extends WrappingObj {
    constructor(){
        const oc = getOC();
        super(new oc.BRepExtrema_DistShapeShape());
    }
    distanceBetween(shape1, shape2) {
        this.wrapped.LoadS1(shape1.wrapped);
        this.wrapped.LoadS2(shape2.wrapped);
        this.wrapped.Perform();
        return this.wrapped.Value();
    }
}
export function measureDistanceBetween(shape1, shape2) {
    return new DistanceTool().distanceBetween(shape1, shape2);
}
export class DistanceQuery extends WrappingObj {
    constructor(shape){
        const oc = getOC();
        super(new oc.BRepExtrema_DistShapeShape());
        this.wrapped.LoadS1(shape.wrapped);
    }
    distanceTo(shape) {
        this.wrapped.LoadS2(shape.wrapped);
        this.wrapped.Perform();
        return this.wrapped.Value();
    }
}
