import { Vector, Plane } from "../geom.js";
import { localGC } from "../register.js";
import { makeFace, makeNewFaceWithinFace } from "../shapeHelpers.js";
import { basicFaceExtrusion, complexExtrude, twistExtrude, revolution, genericSweep, loft } from "../addThickness.js";


export default class Sketch {
    wire;
    _defaultOrigin;
    _defaultDirection;
    _baseFace;
    constructor(wire, { defaultOrigin = [
        0,
        0,
        0
    ], defaultDirection = [
        0,
        0,
        1
    ] } = {}){
        this.wire = wire;
        this.defaultOrigin = defaultOrigin;
        this.defaultDirection = defaultDirection;
        this.baseFace = null;
    }
    get baseFace() {
        return this._baseFace;
    }
    set baseFace(newFace) {
        if (!newFace) this._baseFace = newFace;
        else this._baseFace = newFace.clone();
    }
    delete() {
        this.wire.delete();
        this._defaultOrigin.delete();
        this._defaultDirection.delete();
        this.baseFace && this.baseFace.delete();
    }
    clone() {
        const sketch = new Sketch(this.wire.clone(), {
            defaultOrigin: this.defaultOrigin,
            defaultDirection: this.defaultDirection
        });
        if (this.baseFace) sketch.baseFace = this.baseFace.clone();
        return sketch;
    }
    get defaultOrigin() {
        return this._defaultOrigin;
    }
    set defaultOrigin(newOrigin) {
        this._defaultOrigin = new Vector(newOrigin);
    }
    get defaultDirection() {
        return this._defaultDirection;
    }
    set defaultDirection(newDirection) {
        this._defaultDirection = new Vector(newDirection);
    }
    face() {
        let face;
        if (!this.baseFace) {
            face = makeFace(this.wire);
        } else {
            face = makeNewFaceWithinFace(this.baseFace, this.wire);
        }
        return face;
    }
    wires() {
        return this.wire.clone();
    }
    faces() {
        return this.face();
    }
    revolve(revolutionAxis, { origin, angle } = {}) {
        const face = makeFace(this.wire);
        const solid = revolution(face, origin || this.defaultOrigin, revolutionAxis, angle);
        face.delete();
        this.delete();
        return solid;
    }
    extrude(extrusionDistance, { extrusionDirection, extrusionProfile, twistAngle, origin } = {}) {
        const [r, gc] = localGC();
        const extrusionVec = r(new Vector(extrusionDirection || this.defaultDirection).normalized().multiply(extrusionDistance));
        if (extrusionProfile && !twistAngle) {
            const solid = complexExtrude(this.wire, origin || this.defaultOrigin, extrusionVec, extrusionProfile);
            gc();
            this.delete();
            return solid;
        }
        if (twistAngle) {
            const solid = twistExtrude(this.wire, twistAngle, origin || this.defaultOrigin, extrusionVec, extrusionProfile);
            gc();
            this.delete();
            return solid;
        }
        const face = makeFace(this.wire);
        const solid = basicFaceExtrusion(face, extrusionVec);
        gc();
        this.delete();
        return solid;
    }
    sweepSketch(sketchOnPlane, sweepConfig = {}) {
        const startPoint = this.wire.startPoint;
        const normal = this.wire.tangentAt(1e-9).multiply(-1).normalize();
        const xDir = normal.cross(this.defaultDirection).multiply(-1);
        const sketch = sketchOnPlane(new Plane(startPoint, xDir, normal), startPoint);
        const config = {
            forceProfileSpineOthogonality: true,
            ...sweepConfig
        };
        if (this.baseFace) {
            config.support = this.baseFace.wrapped;
        }
        const shape = genericSweep(sketch.wire, this.wire, config);
        this.delete();
        return shape;
    }
    loftWith(otherSketches, loftConfig = {}, returnShell = false) {
        const sketchArray = Array.isArray(otherSketches) ? [
            this,
            ...otherSketches
        ] : [
            this,
            otherSketches
        ];
        const shape = loft(sketchArray.map((s)=>s.wire), loftConfig, returnShell);
        sketchArray.forEach((s)=>s.delete());
        return shape;
    }
}
