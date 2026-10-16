import { getOC } from "../oclib.js";
import { GCWithScope } from "../register.js";
import { unwrapShape } from "./shapeInput.js";
const extractFromPointer = (heap, pointer, size)=>{
    const start = (pointer >>> 0) / heap.BYTES_PER_ELEMENT;
    return Array.from(heap.subarray(start, start + size));
};
export function prepareShapeForMesh(shapeInput, { tolerance = 1e-3, angularTolerance = 0.1 } = {}) {
    const oc = getOC();
    const shape = unwrapShape(shapeInput);
    oc.ReplicadMeshExtractor.mesh(shape, tolerance, angularTolerance);
}
export function mesh(shapeInput, { tolerance = 1e-3, angularTolerance = 0.1 } = {}) {
    const oc = getOC();
    const shape = unwrapShape(shapeInput);
    const raw = oc.ReplicadMeshExtractor.extract(shape, tolerance, angularTolerance, false);
    const buffer = oc.wasmMemory.buffer;
    const heapF32 = new Float32Array(buffer);
    const heapU32 = new Uint32Array(buffer);
    const heapI32 = new Int32Array(buffer);
    const vertices = extractFromPointer(heapF32, raw.getVerticesPtr(), raw.getVerticesSize());
    const normals = extractFromPointer(heapF32, raw.getNormalsPtr(), raw.getNormalsSize());
    const triangles = extractFromPointer(heapU32, raw.getTrianglesPtr(), raw.getTrianglesSize());
    const groupsRaw = extractFromPointer(heapI32, raw.getFaceGroupsPtr(), raw.getFaceGroupsSize());
    const faceGroups = [];
    for(let i = 0; i < groupsRaw.length; i += 3){
        faceGroups.push({
            start: groupsRaw[i],
            count: groupsRaw[i + 1],
            faceId: groupsRaw[i + 2]
        });
    }
    raw.delete();
    return {
        triangles,
        vertices,
        normals,
        faceGroups
    };
}
export function meshEdges(shapeInput, { tolerance = 1e-3, angularTolerance = 0.1 } = {}) {
    const oc = getOC();
    const shape = unwrapShape(shapeInput);
    const raw = oc.ReplicadEdgeMeshExtractor.extract(shape, tolerance, angularTolerance);
    const buffer = oc.wasmMemory.buffer;
    const heapF32 = new Float32Array(buffer);
    const heapI32 = new Int32Array(buffer);
    const lines = extractFromPointer(heapF32, raw.getLinesPtr(), raw.getLinesSize());
    const groupsRaw = extractFromPointer(heapI32, raw.getEdgeGroupsPtr(), raw.getEdgeGroupsSize());
    const edgeGroups = [];
    for(let i = 0; i < groupsRaw.length; i += 3){
        edgeGroups.push({
            start: groupsRaw[i],
            count: groupsRaw[i + 1],
            edgeId: groupsRaw[i + 2]
        });
    }
    raw.delete();
    return {
        lines,
        edgeGroups
    };
}
export function triangulateFace(faceInput, index0 = 0) {
    const oc = getOC();
    const face = unwrapShape(faceInput);
    const r = GCWithScope();
    const location = r(new oc.TopLoc_Location());
    const triangulation = r(oc.BRep_Tool.Triangulation(face, location, 0));
    if (!triangulation || triangulation.isNull()) return null;
    const transformation = r(location.Transformation());
    const result = {
        vertices: [],
        trianglesIndexes: [],
        verticesNormals: []
    };
    const nbNodes = triangulation.NbNodes();
    result.vertices = new Array(nbNodes * 3);
    for(let i = 1; i <= nbNodes; i++){
        const point = r(r(triangulation.Node(i)).Transformed(transformation));
        result.vertices[(i - 1) * 3] = point.X();
        result.vertices[(i - 1) * 3 + 1] = point.Y();
        result.vertices[(i - 1) * 3 + 2] = point.Z();
    }
    const isForward = face.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD;
    const normalSign = isForward ? 1 : -1;
    if (!triangulation.HasNormals()) triangulation.ComputeNormals();
    result.verticesNormals = new Array(nbNodes * 3);
    for(let i = 1; i <= nbNodes; i++){
        const normal = r(r(triangulation.Normal(i)).Transformed(transformation));
        result.verticesNormals[(i - 1) * 3] = normal.X() * normalSign;
        result.verticesNormals[(i - 1) * 3 + 1] = normal.Y() * normalSign;
        result.verticesNormals[(i - 1) * 3 + 2] = normal.Z() * normalSign;
    }
    const nbTriangles = triangulation.NbTriangles();
    result.trianglesIndexes = new Array(nbTriangles * 3);
    for(let nt = 1; nt <= nbTriangles; nt++){
        const triangle = r(triangulation.Triangle(nt));
        let n1 = triangle.Value(1);
        let n2 = triangle.Value(2);
        const n3 = triangle.Value(3);
        if (!isForward) [n1, n2] = [
            n2,
            n1
        ];
        result.trianglesIndexes[(nt - 1) * 3] = n1 - 1 + index0;
        result.trianglesIndexes[(nt - 1) * 3 + 1] = n2 - 1 + index0;
        result.trianglesIndexes[(nt - 1) * 3 + 2] = n3 - 1 + index0;
    }
    return result;
}
