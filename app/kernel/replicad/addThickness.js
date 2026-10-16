import { getOC } from "./oclib.js";
import { Solid, cast, downcast, isShape3D, isWire } from "./shapes.js";
import { makeLine, makeHelix, assembleWire, makeVertex } from "./shapeHelpers.js";
import { localGC } from "./register.js";
import { Vector, makeAx1 } from "./geom.js";
import { DEG2RAD } from "./constants.js";

export const basicFaceExtrusion = (face, extrusionVec)=>{
    const oc = getOC();
    const solidBuilder = new oc.BRepPrimAPI_MakePrism(face.wrapped, extrusionVec.wrapped, false, true);
    const solid = new Solid(downcast(solidBuilder.Shape()));
    solidBuilder.delete();
    return solid;
};
export const revolution = (face, center = [
    0,
    0,
    0
], direction = [
    0,
    0,
    1
], angle = 360)=>{
    const oc = getOC();
    const ax = makeAx1(center, direction);
    const revolBuilder = new oc.BRepPrimAPI_MakeRevol(face.wrapped, ax, angle * DEG2RAD, false);
    const shape = cast(revolBuilder.Shape());
    ax.delete();
    revolBuilder.delete();
    if (!isShape3D(shape)) throw new Error("Could not revolve to a 3d shape");
    return shape;
};
function genericSweep(wire, spine, { frenet = false, auxiliarySpine, law = null, transitionMode = "right", withContact, support, forceProfileSpineOthogonality } = {}, shellMode = false) {
    const oc = getOC();
    const withCorrection = transitionMode === "round" ? true : !!forceProfileSpineOthogonality;
    const sweepBuilder = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
    if (transitionMode) {
        const mode = {
            transformed: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_Transformed,
            round: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner,
            right: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner
        }[transitionMode];
        if (mode) sweepBuilder.SetTransitionMode(mode);
    }
    if (support) {
        sweepBuilder.SetMode(support);
    } else if (frenet) {
        sweepBuilder.SetMode(frenet);
    }
    if (auxiliarySpine) {
        sweepBuilder.SetMode(auxiliarySpine.wrapped, false, oc.BRepFill_TypeOfContact.BRepFill_NoContact);
    }
    if (!law) sweepBuilder.Add(wire.wrapped, !!withContact, withCorrection);
    else sweepBuilder.SetLaw(wire.wrapped, law, !!withContact, withCorrection);
    sweepBuilder.Build();
    if (!shellMode) {
        sweepBuilder.MakeSolid();
    }
    const shape = cast(sweepBuilder.Shape());
    if (!isShape3D(shape)) throw new Error("Could not sweep to a 3d shape");
    if (shellMode) {
        const startWire = cast(sweepBuilder.FirstShape());
        const endWire = cast(sweepBuilder.LastShape());
        if (!isWire(startWire)) throw new Error("Could not sweep with one start wire");
        if (!isWire(endWire)) throw new Error("Could not sweep with one end wire");
        sweepBuilder.delete();
        return [
            shape,
            startWire,
            endWire
        ];
    }
    sweepBuilder.delete();
    return shape;
}
export { genericSweep };
const buildLawFromProfile = (extrusionLength, { profile, endFactor = 1 })=>{
    let law;
    const oc = getOC();
    if (profile === "s-curve") {
        law = new oc.Law_S();
        law.Set(0, 1, extrusionLength, endFactor);
    } else if (profile === "linear") {
        law = new oc.Law_Linear();
        law.Set(0, 1, extrusionLength, endFactor);
    } else {
        throw new Error("Could not generate a law function");
    }
    return law.Trim(0, extrusionLength, 1e-6);
};
export const supportExtrude = (wire, center, normal, support)=>{
    const centerVec = new Vector(center);
    const normalVec = new Vector(normal);
    const mainSpineEdge = makeLine(centerVec, centerVec.add(normalVec));
    const spine = assembleWire([
        mainSpineEdge
    ]);
    return genericSweep(wire, spine, {
        support
    });
};
function complexExtrude(wire, center, normal, profileShape, shellMode = false) {
    const centerVec = new Vector(center);
    const normalVec = new Vector(normal);
    const mainSpineEdge = makeLine(centerVec, centerVec.add(normalVec));
    const spine = assembleWire([
        mainSpineEdge
    ]);
    const law = profileShape ? buildLawFromProfile(normalVec.Length, profileShape) : null;
    const shape = shellMode ? genericSweep(wire, spine, {
        law
    }, shellMode) : genericSweep(wire, spine, {
        law
    }, shellMode);
    return shape;
}
export { complexExtrude };
function twistExtrude(wire, angleDegrees, center, normal, profileShape, shellMode = false) {
    const centerVec = new Vector(center);
    const normalVec = new Vector(normal);
    const mainSpineEdge = makeLine(centerVec, centerVec.add(normalVec));
    const spine = assembleWire([
        mainSpineEdge
    ]);
    const pitch = 360.0 / angleDegrees * normalVec.Length;
    const radius = 1;
    const auxiliarySpine = makeHelix(pitch, normalVec.Length, radius, center, normal);
    const law = profileShape ? buildLawFromProfile(normalVec.Length, profileShape) : null;
    const shape = shellMode ? genericSweep(wire, spine, {
        auxiliarySpine,
        law
    }, shellMode) : genericSweep(wire, spine, {
        auxiliarySpine,
        law
    }, shellMode);
    return shape;
}
export { twistExtrude };
export const loft = (wires, { ruled = true, startPoint, endPoint } = {}, returnShell = false)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const loftBuilder = r(new oc.BRepOffsetAPI_ThruSections(!returnShell, ruled, 1e-6));
    if (startPoint) {
        loftBuilder.AddVertex(r(makeVertex(startPoint)).wrapped);
    }
    wires.forEach((w)=>loftBuilder.AddWire(w.wrapped));
    if (endPoint) {
        loftBuilder.AddVertex(r(makeVertex(endPoint)).wrapped);
    }
    loftBuilder.Build();
    const shape = cast(loftBuilder.Shape());
    gc();
    if (!isShape3D(shape)) throw new Error("Could not loft to a 3d shape");
    return shape;
};
