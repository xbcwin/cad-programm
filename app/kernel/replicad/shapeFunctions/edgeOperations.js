import { DEG2RAD } from "../constants.js";
import { getOC } from "../oclib.js";
import { GCWithScope } from "../register.js";
import { unwrapShape } from "./shapeInput.js";
import { iterTopo } from "./topology.js";
export function isFilletRadius(radius) {
    if (typeof radius === "number") return true;
    return Array.isArray(radius) && radius.length === 2 && radius.every((value)=>typeof value === "number");
}
export function* selectEdgeRadii(shapeInput, radiusConfig, isRadius, wrapEdge) {
    const shape = unwrapShape(shapeInput);
    if (isRadius(radiusConfig)) {
        for (const edge of iterTopo(shape, "edge")){
            yield {
                edge,
                radius: radiusConfig
            };
        }
        return;
    }
    let radiusForEdge;
    let filterToDelete = null;
    if (typeof radiusConfig === "function") {
        radiusForEdge = radiusConfig;
    } else {
        radiusForEdge = (edge)=>radiusConfig.filter.shouldKeep(edge) ? radiusConfig.radius || 1 : null;
        if (!radiusConfig.keep) filterToDelete = radiusConfig.filter;
    }
    try {
        for (const edge of iterTopo(shape, "edge")){
            const wrappedEdge = wrapEdge(edge);
            try {
                const radius = radiusForEdge(wrappedEdge);
                if (radius) yield {
                    edge,
                    radius
                };
            } finally{
                wrappedEdge.delete();
            }
        }
    } finally{
        filterToDelete?.delete();
    }
}
export function* mapSelectedEdges(edges, map) {
    for (const selected of edges)yield map(selected);
}
export function filletShape(shapeInput, edges) {
    const oc = getOC();
    const r = GCWithScope();
    const builder = r(new oc.BRepFilletAPI_MakeFillet(unwrapShape(shapeInput), oc.ChFi3d_FilletShape.ChFi3d_Rational));
    let edgeCount = 0;
    for (const { radius, edge: edgeInput } of edges){
        const edge = unwrapShape(edgeInput);
        if (typeof radius === "number") {
            builder.Add(radius, edge);
        } else {
            builder.Add(radius[0], radius[1], edge);
        }
        edgeCount += 1;
    }
    if (!edgeCount) throw new Error("Could not fillet, no edge was selected");
    return builder.Shape();
}
export function chamferShape(shapeInput, edges) {
    const oc = getOC();
    const r = GCWithScope();
    const builder = r(new oc.BRepFilletAPI_MakeChamfer(unwrapShape(shapeInput)));
    let edgeCount = 0;
    for (const config of edges){
        const edge = unwrapShape(config.edge);
        if ("radius" in config) {
            builder.Add(config.radius, edge);
        } else if ("distances" in config) {
            builder.Add(config.distances[0] ?? 1, config.distances[1] ?? 1, edge, unwrapShape(config.face));
        } else {
            builder.AddDA(config.distance, config.angle * DEG2RAD, edge, unwrapShape(config.face));
        }
        edgeCount += 1;
    }
    if (!edgeCount) throw new Error("Could not chamfer, no edge was selected");
    return builder.Shape();
}
