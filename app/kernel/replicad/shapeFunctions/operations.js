import { DEG2RAD } from "../constants.js";
import { asDir, asPnt, makePln } from "../geom.js";
import { makePlane } from "../geomHelpers.js";
import { getOC } from "../oclib.js";
import { GCWithScope } from "../register.js";
import { unwrapShape } from "./shapeInput.js";

const configureGlue = (builder, optimisation)=>{
    const oc = getOC();
    if (optimisation === "commonFace") {
        builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
    }
    if (optimisation === "sameFace") {
        builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
    }
};
export function fuseShapes(leftInput, rightInput, { optimisation = "none" } = {}) {
    const oc = getOC();
    const r = GCWithScope();
    const builder = r(new oc.BRepAlgoAPI_Fuse(unwrapShape(leftInput), unwrapShape(rightInput)));
    configureGlue(builder, optimisation);
    builder.Build();
    builder.SimplifyResult(true, true, 1e-3);
    return builder.Shape();
}
export function cutShape(shapeInput, toolInput, { optimisation = "none" } = {}) {
    const oc = getOC();
    const r = GCWithScope();
    const builder = r(new oc.BRepAlgoAPI_Cut(unwrapShape(shapeInput), unwrapShape(toolInput)));
    configureGlue(builder, optimisation);
    builder.Build();
    builder.SimplifyResult(true, true, 1e-3);
    return builder.Shape();
}
export function intersectShapes(leftInput, rightInput) {
    const oc = getOC();
    const r = GCWithScope();
    const builder = r(new oc.BRepAlgoAPI_Common(unwrapShape(leftInput), unwrapShape(rightInput)));
    builder.Build();
    builder.SimplifyResult(true, true, 1e-3);
    return builder.Shape();
}
const signedDistanceToPlane = (point, plane)=>(point[0] - plane.origin.x) * plane.zDir.x + (point[1] - plane.origin.y) * plane.zDir.y + (point[2] - plane.origin.z) * plane.zDir.z;
export function splitShape(shapeInput, inputPlane = "XY", offset = 0, tolerance = 1e-7) {
    const oc = getOC();
    const r = GCWithScope();
    const shape = unwrapShape(shapeInput);
    const basePlane = r(makePlane(inputPlane));
    const plane = offset === 0 ? basePlane : r(basePlane.translate([
        basePlane.zDir.x * offset,
        basePlane.zDir.y * offset,
        basePlane.zDir.z * offset
    ]));
    const ocPlane = r(makePln(plane.origin, plane.zDir));
    const faceBuilder = r(new oc.BRepBuilderAPI_MakeFace(ocPlane));
    const splittingFace = r(faceBuilder.Face());
    const argumentsList = r(new oc.NCollection_List_TopoDS_Shape());
    argumentsList.Append(shape);
    const toolsList = r(new oc.NCollection_List_TopoDS_Shape());
    toolsList.Append(splittingFace);
    const builder = r(new oc.BRepAlgoAPI_Splitter());
    builder.SetArguments(argumentsList);
    builder.SetTools(toolsList);
    builder.Build();
    if (builder.HasErrors()) throw new Error("Could not split shape with plane");
    const splitResult = builder.Shape();
    const pieces = splitResult.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SOLID ? [
        oc.TopoDS.Solid(splitResult)
    ] : [
        ...iterTopo(splitResult, "solid")
    ];
    splitResult.delete();
    const grouped = {
        positive: [],
        negative: [],
        on: []
    };
    for (const piece of pieces){
        const bounds = r(new oc.Bnd_Box());
        oc.BRepBndLib.Add(piece, bounds, true);
        const min = r(bounds.CornerMin());
        const max = r(bounds.CornerMax());
        const center = [
            (min.X() + max.X()) / 2,
            (min.Y() + max.Y()) / 2,
            (min.Z() + max.Z()) / 2
        ];
        const distance = signedDistanceToPlane(center, plane);
        if (distance > tolerance) grouped.positive.push(piece);
        else if (distance < -tolerance) grouped.negative.push(piece);
        else grouped.on.push(piece);
    }
    const asShape = (group)=>{
        if (!group.length) return null;
        if (group.length === 1) return group[0];
        const compound = new oc.TopoDS_Compound();
        const compoundBuilder = r(new oc.TopoDS_Builder());
        compoundBuilder.MakeCompound(compound);
        group.forEach((piece)=>compoundBuilder.Add(compound, piece));
        group.forEach((piece)=>piece.delete());
        return compound;
    };
    return {
        positive: asShape(grouped.positive),
        negative: asShape(grouped.negative),
        on: asShape(grouped.on)
    };
}
export function cutShapeWithPlane(shapeInput, inputPlane = "XY", offset = 0, keep = "positive") {
    const oc = getOC();
    const r = GCWithScope();
    const shape = unwrapShape(shapeInput);
    const basePlane = r(makePlane(inputPlane));
    const plane = offset === 0 ? basePlane : r(basePlane.translate([
        basePlane.zDir.x * offset,
        basePlane.zDir.y * offset,
        basePlane.zDir.z * offset
    ]));
    const ocPlane = r(makePln(plane.origin, plane.zDir));
    const faceBuilder = r(new oc.BRepBuilderAPI_MakeFace(ocPlane));
    const face = r(faceBuilder.Face());
    const removedSign = keep === "negative" ? 1 : -1;
    const referencePoint = r(asPnt([
        plane.origin.x + plane.zDir.x * removedSign,
        plane.origin.y + plane.zDir.y * removedSign,
        plane.origin.z + plane.zDir.z * removedSign
    ]));
    const halfSpaceBuilder = r(new oc.BRepPrimAPI_MakeHalfSpace(face, referencePoint));
    const halfSpace = r(halfSpaceBuilder.Solid());
    const builder = r(new oc.BRepAlgoAPI_Cut(shape, halfSpace));
    builder.Build();
    if (builder.HasErrors()) throw new Error("Could not cut shape with plane");
    const cutResult = builder.Shape();
    const solids = cutResult.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SOLID ? [
        oc.TopoDS.Solid(cutResult)
    ] : [
        ...iterTopo(cutResult, "solid")
    ];
    cutResult.delete();
    if (!solids.length) return null;
    if (solids.length === 1) return solids[0];
    const compound = new oc.TopoDS_Compound();
    const compoundBuilder = r(new oc.TopoDS_Builder());
    compoundBuilder.MakeCompound(compound);
    solids.forEach((solid)=>compoundBuilder.Add(compound, solid));
    solids.forEach((solid)=>solid.delete());
    return compound;
}
export function shellShape(shapeInput, { faces, thickness, tolerance = 1e-3 }) {
    const oc = getOC();
    const r = GCWithScope();
    const facesToRemove = r(new oc.NCollection_List_TopoDS_Shape());
    for (const face of faces)facesToRemove.Append(unwrapShape(face));
    const builder = r(new oc.BRepOffsetAPI_MakeThickSolid());
    builder.MakeThickSolidByJoin(unwrapShape(shapeInput), facesToRemove, -thickness, tolerance, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
    return builder.Shape();
}
export function draftShape(shapeInput, { faces, angle, neutralPlane = "XY" }) {
    const oc = getOC();
    const shape = unwrapShape(shapeInput);
    const builder = new oc.BRepOffsetAPI_DraftAngle(shape);
    const inputPlane = makePlane(neutralPlane);
    const plane = makePln(inputPlane.origin, inputPlane.zDir);
    const direction = asDir(inputPlane.zDir);
    for (const face of faces){
        builder.Add(unwrapShape(face), direction, angle * DEG2RAD, plane, false);
    }
    builder.Build();
    const result = builder.ModifiedShape(shape);
    builder.delete();
    plane.delete();
    direction.delete();
    inputPlane.delete();
    return result;
}
