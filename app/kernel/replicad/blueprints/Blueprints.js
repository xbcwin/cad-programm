import { BoundingBox2d } from "../lib2d/index.js";
import Blueprint from "./Blueprint.js";
import CompoundBlueprint from "./CompoundBlueprint.js";

import { asSVG, viewbox } from "./svg.js";



import Sketches from "../sketches/Sketches.js";

export default class Blueprints {
    blueprints;
    _boundingBox;
    constructor(blueprints){
        this.blueprints = blueprints;
        this._boundingBox = null;
    }
    get repr() {
        return [
            "Blueprints",
            ...this.blueprints.map((b)=>b.repr)
        ].join("\n");
    }
    clone() {
        return new Blueprints(this.blueprints);
    }
    get boundingBox() {
        if (!this._boundingBox) {
            const box = new BoundingBox2d();
            this.blueprints.forEach((b)=>box.add(b.boundingBox));
            this._boundingBox = box;
        }
        return this._boundingBox;
    }
    stretch(ratio, direction, origin) {
        return new Blueprints(this.blueprints.map((bp)=>bp.stretch(ratio, direction, origin)));
    }
    rotate(angle, center) {
        return new Blueprints(this.blueprints.map((bp)=>bp.rotate(angle, center)));
    }
    scale(scaleFactor, center) {
        const centerPoint = center || this.boundingBox.center;
        return new Blueprints(this.blueprints.map((bp)=>bp.scale(scaleFactor, centerPoint)));
    }
    translate(xDistOrPoint, yDist = 0) {
        return new Blueprints(this.blueprints.map((bp)=>bp.translate(xDistOrPoint, yDist)));
    }
    mirror(centerOrDirection, origin, mode) {
        return new Blueprints(this.blueprints.map((bp)=>bp.mirror(centerOrDirection, origin, mode)));
    }
    sketchOnPlane(plane, origin) {
        return new Sketches(this.blueprints.map((bp)=>bp.sketchOnPlane(plane, origin)));
    }
    sketchOnFace(face, scaleMode) {
        return new Sketches(this.blueprints.map((bp)=>bp.sketchOnFace(face, scaleMode)));
    }
    punchHole(shape, face, options = {}) {
        let outShape = shape;
        this.blueprints.forEach((b)=>{
            outShape = b.punchHole(outShape, face, options);
        });
        return outShape;
    }
    toSVGViewBox(margin = 1) {
        return viewbox(this.boundingBox, margin);
    }
    toSVGPaths() {
        return this.blueprints.map((bp)=>bp.toSVGPaths());
    }
    toSVG(margin = 1) {
        const elements = this.blueprints.map((bp)=>{
            if (bp instanceof Blueprint) return bp.toSVGPath();
            else return bp.toSVGGroup();
        });
        return asSVG(elements.join("\n    "), this.boundingBox, margin);
    }
}
