import { uuidv } from "../utils/uuid.js";
import { getOC } from "../oclib.js";

import { GCWithScope, WrappingObj } from "../register.js";
const wrapString = (str)=>{
    const oc = getOC();
    return new oc.TCollection_ExtendedString(str, true);
};
function parseSlice(hex, index) {
    return parseInt(hex.slice(index * 2, (index + 1) * 2), 16);
}
function colorFromHex(hex) {
    let color = hex;
    if (color.indexOf("#") === 0) color = color.slice(1);
    if (color.length === 3) {
        color = color.replace(/([0-9a-f])/gi, "$1$1");
    }
    return [
        parseSlice(color, 0),
        parseSlice(color, 1),
        parseSlice(color, 2)
    ];
}
const wrapColor = (hex, alpha = 1)=>{
    const oc = getOC();
    const [r, g, b] = colorFromHex(hex);
    return new oc.Quantity_ColorRGBA(r / 255, g / 255, b / 255, alpha);
};
export class AssemblyExporter extends WrappingObj {
}
export function createAssembly(shapes = []) {
    const oc = getOC();
    const doc = new oc.TDocStd_Document(wrapString("XmlOcaf"));
    oc.XCAFDoc_ShapeTool.SetAutoNaming(false);
    const mainLabel = doc.Main();
    const tool = oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel);
    const ctool = oc.XCAFDoc_DocumentTool.ColorTool(mainLabel);
    for (const { shape, name, color, alpha } of shapes){
        const shapeNode = tool.NewShape();
        tool.SetShape(shapeNode, shape.wrapped);
        oc.TDataStd_Name.Set(shapeNode, wrapString(name || uuidv()));
        ctool.SetColor(shapeNode, wrapColor(color || "#f00", alpha ?? 1), oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
    }
    tool.UpdateAssemblies();
    return new AssemblyExporter(doc);
}
export function exportSTEP(shapes = [], { unit, modelUnit } = {}) {
    const oc = getOC();
    const r = GCWithScope();
    const doc = createAssembly(shapes);
    if (unit || modelUnit) {
        const dummy = r(new oc.STEPCAFControl_Writer());
        oc.Interface_Static.SetCVal("xstep.cascade.unit", (modelUnit || unit || "MM").toUpperCase());
        oc.Interface_Static.SetCVal("write.step.unit", (unit || modelUnit || "MM").toUpperCase());
    }
    const session = r(new oc.XSControl_WorkSession());
    const writer = r(new oc.STEPCAFControl_Writer(session, false));
    writer.SetColorMode(true);
    writer.SetLayerMode(true);
    writer.SetNameMode(true);
    oc.Interface_Static.SetIVal("write.surfacecurve.mode", 1);
    oc.Interface_Static.SetIVal("write.precision.mode", 0);
    oc.Interface_Static.SetIVal("write.step.assembly", 2);
    oc.Interface_Static.SetIVal("write.step.schema", 5);
    const filename = "export.step";
    const progress = r(new oc.Message_ProgressRange());
    const success = writer.Perform(doc.wrapped, filename, progress);
    if (success) {
        const file = oc.FS.readFile("/" + filename);
        oc.FS.unlink("/" + filename);
        const blob = new Blob([
            file
        ], {
            type: "application/STEP"
        });
        return blob;
    } else {
        throw new Error("WRITE STEP FILE FAILED.");
    }
}
