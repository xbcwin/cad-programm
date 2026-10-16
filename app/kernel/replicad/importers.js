import { cast } from "./shapes.js";
import { getOC } from "./oclib.js";
import { localGC } from "./register.js";
import { MeshShape } from "./meshShapes.js";
import { getManifold } from "./manifoldlib.js";
const uniqueId = ()=>Date.now().toString(36) + Math.random().toString(36).substring(2);
export async function importSTEP(STLBlob) {
    const oc = getOC();
    const [r, gc] = localGC();
    const fileName = uniqueId();
    const bufferView = new Uint8Array(await STLBlob.arrayBuffer());
    oc.FS.writeFile(`/${fileName}`, bufferView);
    const reader = r(new oc.STEPControl_Reader());
    if (reader.ReadFile(fileName)) {
        oc.FS.unlink("/" + fileName);
        reader.TransferRoots();
        const stepShape = r(reader.OneShape());
        const shape = cast(stepShape);
        gc();
        return shape;
    } else {
        oc.FS.unlink("/" + fileName);
        gc();
        throw new Error("Failed to load STEP file");
    }
}
export async function importSTL(STLBlob) {
    const oc = getOC();
    const [r, gc] = localGC();
    const fileName = uniqueId();
    const bufferView = new Uint8Array(await STLBlob.arrayBuffer());
    oc.FS.writeFile(`/${fileName}`, bufferView);
    const reader = r(new oc.StlAPI_Reader());
    const readShape = r(new oc.TopoDS_Shell());
    if (reader.Read(readShape, fileName)) {
        oc.FS.unlink("/" + fileName);
        const shapeUpgrader = r(new oc.ShapeUpgrade_UnifySameDomain(readShape, true, true, false));
        shapeUpgrader.Build();
        const upgradedShape = r(shapeUpgrader.Shape());
        const solidSTL = r(new oc.BRepBuilderAPI_MakeSolid());
        solidSTL.Add(oc.TopoDS.Shell(upgradedShape));
        const asSolid = r(solidSTL.Solid());
        const shape = cast(asSolid);
        gc();
        return shape;
    } else {
        oc.FS.unlink("/" + fileName);
        gc();
        throw new Error("Failed to load STL file");
    }
}
function isBinarySTL(buffer) {
    if (buffer.byteLength < 84) return false;
    const view = new DataView(buffer);
    const numTriangles = view.getUint32(80, true);
    const expectedSize = 80 + 4 + numTriangles * 50;
    if (buffer.byteLength === expectedSize) return true;
    const header = new Uint8Array(buffer, 0, 5);
    const text = String.fromCharCode(...header);
    return !text.startsWith("solid");
}
function parseBinarySTL(buffer) {
    const view = new DataView(buffer);
    const numTriangles = view.getUint32(80, true);
    const vertices = new Float32Array(numTriangles * 9);
    const triangles = new Uint32Array(numTriangles * 3);
    let offset = 84;
    for(let i = 0; i < numTriangles; i++){
        offset += 12;
        for(let v = 0; v < 9; v++){
            vertices[i * 9 + v] = view.getFloat32(offset, true);
            offset += 4;
        }
        offset += 2;
        const base = i * 3;
        triangles[base] = base;
        triangles[base + 1] = base + 1;
        triangles[base + 2] = base + 2;
    }
    return {
        vertices,
        triangles
    };
}
function parseASCIISTL(text) {
    const vertexList = [];
    const vertexRegex = /vertex\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
    let match;
    while((match = vertexRegex.exec(text)) !== null){
        vertexList.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
    }
    const numVertices = vertexList.length / 3;
    const vertices = new Float32Array(vertexList);
    const triangles = new Uint32Array(numVertices);
    for(let i = 0; i < numVertices; i++){
        triangles[i] = i;
    }
    return {
        vertices,
        triangles
    };
}
export async function importSTLAsMesh(stlBlob) {
    const buffer = await stlBlob.arrayBuffer();
    const { vertices, triangles } = isBinarySTL(buffer) ? parseBinarySTL(buffer) : parseASCIISTL(new TextDecoder().decode(buffer));
    if (triangles.length === 0) {
        throw new Error("STL file contains no triangles");
    }
    const numVerts = vertices.length / 3;
    const tolerance = 1e-6;
    const scale = 1 / tolerance;
    const mergeFrom = [];
    const mergeTo = [];
    const seen = new Map();
    for(let i = 0; i < numVerts; i++){
        const x = vertices[i * 3];
        const y = vertices[i * 3 + 1];
        const z = vertices[i * 3 + 2];
        const key = `${Math.round(x * scale)}|${Math.round(y * scale)}|${Math.round(z * scale)}`;
        const existing = seen.get(key);
        if (existing !== undefined) {
            mergeFrom.push(i);
            mergeTo.push(existing);
        } else {
            seen.set(key, i);
        }
    }
    const manifold = getManifold();
    const mesh = new manifold.Mesh({
        numProp: 3,
        vertProperties: vertices,
        triVerts: triangles,
        mergeFromVert: mergeFrom.length ? new Uint32Array(mergeFrom) : undefined,
        mergeToVert: mergeTo.length ? new Uint32Array(mergeTo) : undefined
    });
    const manifoldShape = new manifold.Manifold(mesh);
    return new MeshShape(manifoldShape);
}
