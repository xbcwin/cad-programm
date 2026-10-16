import { getOC } from "../oclib.js";
import { prepareShapeForMesh } from "./mesh.js";
import { unwrapShape } from "./shapeInput.js";
export function serializeShape(shapeInput) {
    const oc = getOC();
    return oc.BRepToolsWrapper.Write(unwrapShape(shapeInput));
}
export function deserializeTopoShape(data) {
    return getOC().BRepToolsWrapper.Read(data);
}
export function exportShapeSTEP(shapeInput) {
    const oc = getOC();
    const shape = unwrapShape(shapeInput);
    const filename = "blob.step";
    const writer = new oc.STEPControl_Writer();
    oc.Interface_Static.SetIVal("write.step.schema", 5);
    const progress = new oc.Message_ProgressRange();
    writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
    const done = writer.Write(filename);
    writer.delete();
    progress.delete();
    if (done === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
        const file = oc.FS.readFile("/" + filename);
        oc.FS.unlink("/" + filename);
        return new Blob([
            file
        ], {
            type: "application/STEP"
        });
    }
    throw new Error("WRITE STEP FILE FAILED.");
}
export function exportShapeSTL(shapeInput, { tolerance = 1e-3, angularTolerance = 0.1, binary = false } = {}) {
    const oc = getOC();
    const shape = unwrapShape(shapeInput);
    prepareShapeForMesh(shape, {
        tolerance,
        angularTolerance
    });
    const filename = "blob.stl";
    const done = oc.StlAPI.Write(shape, filename, !binary);
    if (done) {
        const file = oc.FS.readFile("/" + filename);
        oc.FS.unlink("/" + filename);
        return new Blob([
            file
        ], {
            type: "application/sla"
        });
    }
    throw new Error("WRITE STL FILE FAILED.");
}
