import { BoundingBox2d } from "../lib2d/index.js";
import Blueprint from "./Blueprint.js";

import { asSVG, viewbox } from "./svg.js";



import CompoundSketch from "../sketches/CompoundSketch.js";

export default class CompoundBlueprint {
    blueprints;
    _boundingBox;
    constructor(blueprints){
        this.blueprints = blueprints;
        this._boundingBox = null;
    }
    clone() {
        return new CompoundBlueprint(this.blueprints);
    }
    get boundingBox() {
        if (!this._boundingBox) {
            const box = new BoundingBox2d();
            this.blueprints.forEach((b)=>box.add(b.boundingBox));
            this._boundingBox = box;
        }
        return this._boundingBox;
    }
    get repr() {
        return [
            "Compound Blueprints",
            "-- Outline",
            this.blueprints[0].repr,
            "-- Holes",
            ...this.blueprints.slice(1).map((b)=>b.repr)
        ].join("\n");
    }
    stretch(ratio, direction, origin) {
        return new CompoundBlueprint(this.blueprints.map((bp)=>bp.stretch(ratio, direction, origin)));
    }
    rotate(angle, center) {
        return new CompoundBlueprint(this.blueprints.map((bp)=>bp.rotate(angle, center)));
    }
    scale(scaleFactor, center) {
        const centerPoint = center || this.boundingBox.center;
        return new CompoundBlueprint(this.blueprints.map((bp)=>bp.scale(scaleFactor, centerPoint)));
    }
    translate(xDistOrPoint, yDist = 0) {
        return new CompoundBlueprint(this.blueprints.map((bp)=>bp.translate(xDistOrPoint, yDist)));
    }
    mirror(centerOrDirection, origin, mode) {
        return new CompoundBlueprint(this.blueprints.map((bp)=>bp.mirror(centerOrDirection, origin, mode)));
    }
    sketchOnPlane(plane, origin) {
        const sketches = this.blueprints.map((blueprint)=>blueprint.sketchOnPlane(plane, origin));
        return new CompoundSketch(sketches);
    }
    sketchOnFace(face, scaleMode) {
        const sketches = this.blueprints.map((blueprint)=>blueprint.sketchOnFace(face, scaleMode));
        return new CompoundSketch(sketches);
    }
    punchHole(shape, face, options = {}) {
        return this.blueprints[0].punchHole(shape, face, options);
    }
    toSVGViewBox(margin = 1) {
        return viewbox(this.boundingBox, margin);
    }
    toSVGPaths() {
        return this.blueprints.flatMap((bp)=>bp.toSVGPaths());
    }
    toSVGGroup() {
        return `<g>${this.blueprints.map((b)=>b.toSVGPath()).join("")}</g>`;
    }
    toSVG(margin = 1) {
        return asSVG(this.toSVGGroup(), this.boundingBox, margin);
    }
}
