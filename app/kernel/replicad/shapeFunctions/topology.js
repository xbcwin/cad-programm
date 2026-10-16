
import { getOC } from "../oclib.js";
const TOPOLOGY_KINDS = [
    "vertex",
    "edge",
    "wire",
    "face",
    "shell",
    "solid",
    "solidCompound",
    "compound"
];
const buildDefinitions = (oc)=>{
    const ta = oc.TopAbs_ShapeEnum;
    const shapeEnum = {
        vertex: ta.TopAbs_VERTEX,
        edge: ta.TopAbs_EDGE,
        wire: ta.TopAbs_WIRE,
        face: ta.TopAbs_FACE,
        shell: ta.TopAbs_SHELL,
        solid: ta.TopAbs_SOLID,
        solidCompound: ta.TopAbs_COMPSOLID,
        compound: ta.TopAbs_COMPOUND,
        shape: ta.TopAbs_SHAPE
    };
    return {
        shapeEnum,
        kindOf: new Map(TOPOLOGY_KINDS.map((kind)=>[
                shapeEnum[kind],
                kind
            ])),
        downcast: {
            shape: (shape)=>shape,
            vertex: (shape)=>oc.TopoDS.Vertex(shape),
            edge: (shape)=>oc.TopoDS.Edge(shape),
            wire: (shape)=>oc.TopoDS.Wire(shape),
            face: (shape)=>oc.TopoDS.Face(shape),
            shell: (shape)=>oc.TopoDS.Shell(shape),
            solid: (shape)=>oc.TopoDS.Solid(shape),
            solidCompound: (shape)=>oc.ReplicadShapeCaster.CompSolid(shape),
            compound: (shape)=>oc.TopoDS.Compound(shape)
        }
    };
};
let cache = null;
const definitions = ()=>{
    const oc = getOC();
    if (cache?.oc !== oc) cache = {
        oc,
        definitions: buildDefinitions(oc)
    };
    return cache.definitions;
};
const asTopo = (entity)=>definitions().shapeEnum[entity];
const downcastTo = (shape, entity)=>definitions().downcast[entity](shape);
export function* iterTopo(shape, topo) {
    const oc = getOC();
    const explorer = new oc.TopExp_Explorer(shape, asTopo(topo), asTopo("shape"));
    try {
        const seen = [];
        while(explorer.More()){
            const item = explorer.Current();
            const isDuplicate = seen.some((s)=>s.IsSame(item));
            if (!isDuplicate) {
                seen.push(item);
                yield downcastTo(item, topo);
            }
            explorer.Next();
        }
    } finally{
        explorer.delete();
    }
}
export const shapeType = (shape)=>{
    if (shape.IsNull()) throw new Error("This shape has not type, it is null");
    return shape.ShapeType();
};
export function topologyKind(shape) {
    return definitions().kindOf.get(shapeType(shape));
}
export function downcast(shape) {
    const kind = topologyKind(shape);
    if (!kind) throw new Error(`Unsupported topology type: ${shapeType(shape)}`);
    return definitions().downcast[kind](shape);
}
