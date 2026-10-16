
import { compoundShapes } from "../shapeHelpers.js";


import CompoundSketch from "./CompoundSketch.js";
import Sketch from "./Sketch.js";
export default class Sketches {
    sketches;
    constructor(sketches){
        this.sketches = sketches;
    }
    wires() {
        const wires = this.sketches.map((s)=>s instanceof Sketch ? s.wire : s.wires);
        return compoundShapes(wires);
    }
    faces() {
        const faces = this.sketches.map((s)=>s.face());
        return compoundShapes(faces);
    }
    extrude(extrusionDistance, extrusionConfig = {}) {
        const extruded = this.sketches.map((s)=>s.extrude(extrusionDistance, extrusionConfig));
        return compoundShapes(extruded);
    }
    revolve(revolutionAxis, config) {
        return compoundShapes(this.sketches.map((s)=>s.revolve(revolutionAxis, config)));
    }
}
