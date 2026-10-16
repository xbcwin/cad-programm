import { compoundShapes, addHolesInFace, makeSolid, makeFace } from "../shapeHelpers.js";
import Sketch from "./Sketch.js";
import { Vector } from "../geom.js";
import { basicFaceExtrusion, complexExtrude, twistExtrude, revolution } from "../addThickness.js";

import { cast, Face } from "../shapes.js";
import { getOC } from "../oclib.js";
const guessFaceFromWires = (wires)=>{
    const oc = getOC();
    const faceBuilder = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9);
    wires.forEach((wire, wireIndex)=>{
        wire.edges.forEach((edge)=>{
            faceBuilder.Add(edge.wrapped, oc.GeomAbs_Shape.GeomAbs_C0, wireIndex === 0);
        });
    });
    faceBuilder.Build();
    const newFace = cast(faceBuilder.Shape());
    faceBuilder.delete();
    if (!(newFace instanceof Face)) {
        throw new Error("Failed to create a face");
    }
    return newFace;
};
const fixWire = (wire, baseFace)=>{
    const oc = getOC();
    const wireFixer = new oc.ShapeFix_Wire(wire.wrapped, baseFace.wrapped, 1e-9);
    wireFixer.FixEdgeCurves();
    wireFixer.delete();
    return wire;
};
const faceFromWires = (wires)=>{
    let baseFace;
    let holeWires;
    try {
        baseFace = makeFace(wires[0]);
        holeWires = wires.slice(1);
    } catch (e) {
        baseFace = guessFaceFromWires(wires);
        holeWires = wires.slice(1).map((w)=>fixWire(w, baseFace));
    }
    return addHolesInFace(baseFace, holeWires);
};
const solidFromShellGenerator = (sketches, shellGenerator)=>{
    const shells = [];
    const startWires = [];
    const endWires = [];
    sketches.forEach((sketch)=>{
        const [shell, startWire, endWire] = shellGenerator(sketch);
        shells.push(shell);
        startWires.push(startWire);
        endWires.push(endWire);
    });
    const startFace = faceFromWires(startWires);
    const endFace = faceFromWires(endWires);
    const solid = makeSolid([
        startFace,
        ...shells,
        endFace
    ]);
    return solid;
};
export default class CompoundSketch {
    sketches;
    constructor(sketches){
        this.sketches = sketches;
    }
    delete() {
        this.sketches.forEach((sketch)=>sketch.delete());
    }
    get outerSketch() {
        return this.sketches[0];
    }
    get innerSketches() {
        return this.sketches.slice(1);
    }
    get wires() {
        const wires = this.sketches.map((s)=>s.wire);
        return compoundShapes(wires);
    }
    face() {
        const baseFace = this.outerSketch.face();
        const newFace = addHolesInFace(baseFace, this.innerSketches.map((s)=>s.wire));
        return newFace;
    }
    extrude(extrusionDistance, { extrusionDirection, extrusionProfile, twistAngle, origin } = {}) {
        const extrusionVec = new Vector(extrusionDirection || this.outerSketch.defaultDirection).normalized().multiply(extrusionDistance);
        if (extrusionProfile && !twistAngle) {
            const solid = solidFromShellGenerator(this.sketches, (sketch)=>complexExtrude(sketch.wire, origin || this.outerSketch.defaultOrigin, extrusionVec, extrusionProfile, true));
            return solid;
        }
        if (twistAngle) {
            const solid = solidFromShellGenerator(this.sketches, (sketch)=>twistExtrude(sketch.wire, twistAngle, origin || this.outerSketch.defaultOrigin, extrusionVec, extrusionProfile, true));
            return solid;
        }
        const solid = basicFaceExtrusion(this.face(), extrusionVec);
        return solid;
    }
    revolve(revolutionAxis, { origin, angle } = {}) {
        const solid = revolution(this.face(), origin || this.outerSketch.defaultOrigin, revolutionAxis, angle);
        return solid;
    }
    loftWith(otherCompound, loftConfig) {
        if (this.sketches.length !== otherCompound.sketches.length) throw new Error("You need to loft with another compound with the same number of sketches");
        const shells = this.sketches.map((base, cIndex)=>{
            const outer = otherCompound.sketches[cIndex];
            return base.clone().loftWith(outer.clone(), {
                ruled: loftConfig.ruled
            }, true);
        });
        const baseFace = this.face().clone();
        shells.push(baseFace, otherCompound.face());
        return makeSolid(shells);
    }
}
