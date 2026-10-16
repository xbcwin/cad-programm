import { WrappingObj } from "./register.js";
import { BoundingBox } from "./geom.js";
import { HASH_CODE_MAX } from "./constants.js";
import { getOC } from "./oclib.js";
import { getManifold } from "./manifoldlib.js";
import { MeshShape } from "./meshShapes.js";
import { mesh as extractShapeMesh, meshEdges as extractShapeEdgeMesh, triangulateFace } from "./shapeFunctions/mesh.js";
import { deserializeTopoShape, exportShapeSTEP, exportShapeSTL, serializeShape } from "./shapeFunctions/export.js";
import { Curve, Surface } from "./shapeFunctions/geometry.js";
import { faceCenter, faceNormalAt, faceUVBounds, faceUVCoordinates, pointOnFace } from "./shapeFunctions/faceGeometry.js";
import { cutShape, cutShapeWithPlane, draftShape, fuseShapes, intersectShapes, shellShape, splitShape } from "./shapeFunctions/operations.js";
import { chamferShape, filletShape, isFilletRadius, mapSelectedEdges, selectEdgeRadii } from "./shapeFunctions/edgeOperations.js";
import { downcast, iterTopo, shapeType } from "./shapeFunctions/topology.js";
import { makeCaster } from "./shapeFunctions/casting.js";

import { EdgeFinder, FaceFinder } from "./finders/index.js";
import { rotate, translate, mirror, scale as scaleShape } from "./geomHelpers.js";
export { Curve, Surface };
function isChamferRadius(r) {
    if (typeof r === "number") return true;
    if (typeof r === "object" && r !== null) {
        const obj = r;
        return "distances" in obj && Array.isArray(obj.distances) && "selectedFace" in obj || "distance" in obj && "angle" in obj && "selectedFace" in obj;
    }
    return false;
}
export { downcast, iterTopo, shapeType };
export function deserializeShape(data) {
    return cast(deserializeTopoShape(data));
}
export class Shape extends WrappingObj {
    constructor(ocShape){
        super(ocShape);
    }
    clone() {
        return new this.constructor(downcast(this.wrapped));
    }
    serialize() {
        return serializeShape(this.wrapped);
    }
    get hashCode() {
        return this.oc.ReplicadShapeHasher.HashCode(this.wrapped, HASH_CODE_MAX);
    }
    get isNull() {
        return this.wrapped.IsNull();
    }
    isSame(other) {
        return this.wrapped.IsSame(other.wrapped);
    }
    isEqual(other) {
        return this.wrapped.IsEqual(other.wrapped);
    }
    split(plane = "XY", offset = 0, tolerance = 1e-7) {
        const result = splitShape(this.wrapped, plane, offset, tolerance);
        const castResult = (piece)=>{
            if (!piece) return null;
            const resultShape = cast(piece);
            if (resultShape instanceof Solid || resultShape instanceof Compound) {
                return resultShape;
            }
            resultShape.delete();
            throw new Error("Split produced an unexpected non-solid shape");
        };
        return {
            positive: castResult(result.positive),
            negative: castResult(result.negative),
            on: castResult(result.on)
        };
    }
    asShape3D() {
        if (isShape3D(this)) {
            return this;
        }
        throw new Error("Shape is not a 3D shape");
    }
    simplify() {
        const oc = getOC();
        const shapeUpgrader = new oc.ShapeUpgrade_UnifySameDomain(this.wrapped, true, true, false);
        shapeUpgrader.Build();
        const newShape = cast(shapeUpgrader.Shape());
        shapeUpgrader.delete();
        if (this.constructor !== newShape.constructor) throw new Error("unexpected types mismatch");
        return newShape;
    }
    translate(vectorOrxDist, yDist = 0, zDist = 0) {
        const translation = typeof vectorOrxDist === "number" ? [
            vectorOrxDist,
            yDist,
            zDist
        ] : vectorOrxDist;
        const newShape = cast(translate(this.wrapped, translation));
        this.delete();
        if (this.constructor !== newShape.constructor) throw new Error("unexpected types mismatch");
        return newShape;
    }
    translateX(distance) {
        return this.translate([
            distance,
            0,
            0
        ]);
    }
    translateY(distance) {
        return this.translate([
            0,
            distance,
            0
        ]);
    }
    translateZ(distance) {
        return this.translate([
            0,
            0,
            distance
        ]);
    }
    rotate(angle, position = [
        0,
        0,
        0
    ], direction = [
        0,
        0,
        1
    ]) {
        const newShape = cast(rotate(this.wrapped, angle, position, direction));
        this.delete();
        if (this.constructor !== newShape.constructor) throw new Error("unexpected types mismatch");
        return newShape;
    }
    mirror(inputPlane, origin) {
        const newShape = cast(mirror(this.wrapped, inputPlane, origin));
        this.delete();
        if (this.constructor !== newShape.constructor) throw new Error("unexpected types mismatch");
        return newShape;
    }
    scale(scale, center = [
        0,
        0,
        0
    ]) {
        const newShape = cast(scaleShape(this.wrapped, center, scale));
        this.delete();
        if (this.constructor !== newShape.constructor) throw new Error("unexpected types mismatch");
        return newShape;
    }
    get edges() {
        return Array.from(iterTopo(this.wrapped, "edge"), (edge)=>new Edge(edge));
    }
    get faces() {
        return Array.from(iterTopo(this.wrapped, "face"), (face)=>new Face(face));
    }
    get solids() {
        return Array.from(iterTopo(this.wrapped, "solid"), (solid)=>new Solid(solid));
    }
    get wires() {
        return Array.from(iterTopo(this.wrapped, "wire"), (wire)=>new Wire(wire));
    }
    get boundingBox() {
        const bbox = new BoundingBox();
        this.oc.BRepBndLib.AddOptimal(this.wrapped, bbox.wrapped, false, false);
        return bbox;
    }
    mesh(options = {}) {
        return extractShapeMesh(this.wrapped, options);
    }
    meshEdges(options = {}) {
        return extractShapeEdgeMesh(this.wrapped, options);
    }
    blobSTEP() {
        return exportShapeSTEP(this.wrapped);
    }
    blobSTL(options = {}) {
        return exportShapeSTL(this.wrapped, options);
    }
}
export class Vertex extends Shape {
    asTuple() {
        const pnt = this.oc.BRep_Tool.Pnt(this.wrapped);
        const tuple = [
            pnt.X(),
            pnt.Y(),
            pnt.Z()
        ];
        pnt.delete();
        return tuple;
    }
}
export class _1DShape extends Shape {
    get repr() {
        const { startPoint, endPoint } = this;
        const retVal = `start: (${this.startPoint.repr}) end:(${this.endPoint.repr})`;
        startPoint.delete();
        endPoint.delete();
        return retVal;
    }
    get curve() {
        return new Curve(this._geomAdaptor());
    }
    get startPoint() {
        return this.curve.startPoint;
    }
    get endPoint() {
        return this.curve.endPoint;
    }
    tangentAt(position = 0) {
        return this.curve.tangentAt(position);
    }
    pointAt(position = 0) {
        return this.curve.pointAt(position);
    }
    get isClosed() {
        return this.curve.isClosed;
    }
    get isPeriodic() {
        return this.curve.isPeriodic;
    }
    get period() {
        return this.curve.period;
    }
    get geomType() {
        return this.curve.curveType;
    }
    get length() {
        const properties = new this.oc.GProp_GProps();
        this.oc.BRepGProp.LinearProperties(this.wrapped, properties, true, false);
        const length = properties.Mass();
        properties.delete();
        return length;
    }
    get orientation() {
        const orient = this.wrapped.Orientation();
        if (orient === this.oc.TopAbs_Orientation.TopAbs_FORWARD) return "forward";
        return "backward";
    }
    flipOrientation() {
        const flipped = this.wrapped.Reversed();
        return cast(flipped);
    }
}
export class Edge extends _1DShape {
    _geomAdaptor() {
        return new this.oc.BRepAdaptor_Curve(this.wrapped);
    }
}
export class Wire extends _1DShape {
    _geomAdaptor() {
        return new this.oc.BRepAdaptor_CompCurve(this.wrapped, false);
    }
    offset2D(offset, kind = "arc") {
        const kinds = {
            arc: this.oc.GeomAbs_JoinType.GeomAbs_Arc,
            intersection: this.oc.GeomAbs_JoinType.GeomAbs_Intersection,
            tangent: this.oc.GeomAbs_JoinType.GeomAbs_Tangent
        };
        const offsetter = new this.oc.BRepOffsetAPI_MakeOffset(this.wrapped, kinds[kind], false);
        offsetter.Perform(offset, 0);
        const newShape = cast(offsetter.Shape());
        offsetter.delete();
        this.delete();
        if (!(newShape instanceof Wire)) throw new Error("Could not offset with a wire");
        return newShape;
    }
}
export class Face extends Shape {
    _geomAdaptor() {
        return new this.oc.BRepAdaptor_Surface(this.wrapped, false);
    }
    get surface() {
        return new Surface(this._geomAdaptor());
    }
    get orientation() {
        const orient = this.wrapped.Orientation();
        if (orient === this.oc.TopAbs_Orientation.TopAbs_FORWARD) return "forward";
        return "backward";
    }
    flipOrientation() {
        const flipped = this.wrapped.Reversed();
        return cast(flipped);
    }
    get geomType() {
        const surface = this.surface;
        const geomType = surface.surfaceType;
        surface.delete();
        return geomType;
    }
    get UVBounds() {
        return faceUVBounds(this.wrapped);
    }
    pointOnSurface(u, v) {
        return pointOnFace(this.wrapped, u, v);
    }
    uvCoordinates(point) {
        return faceUVCoordinates(this.wrapped, point);
    }
    normalAt(locationVector) {
        return faceNormalAt(this.wrapped, locationVector);
    }
    get center() {
        return faceCenter(this.wrapped);
    }
    outerWire() {
        const newVal = new Wire(this.oc.BRepTools.OuterWire(this.wrapped));
        this.delete();
        return newVal;
    }
    innerWires() {
        const outer = this.clone().outerWire();
        const innerWires = this.wires.filter((w)=>!outer.isSame(w));
        outer.delete();
        this.delete();
        return innerWires;
    }
    triangulation(index0 = 0) {
        return triangulateFace(this.wrapped, index0);
    }
}
export class _3DShape extends Shape {
    fuse(other, options = {}) {
        const newShape = cast(fuseShapes(this.wrapped, other.wrapped, options));
        if (!isShape3D(newShape)) throw new Error("Could not fuse as a 3d shape");
        return newShape;
    }
    cut(tool, options = {}) {
        const newShape = cast(cutShape(this.wrapped, tool.wrapped, options));
        if (!isShape3D(newShape)) throw new Error("Could not cut as a 3d shape");
        return newShape;
    }
    intersect(tool) {
        const newShape = cast(intersectShapes(this.wrapped, tool.wrapped));
        if (!isShape3D(newShape)) throw new Error("Could not intersect as a 3d shape");
        return newShape;
    }
    cutPlane(plane = "XY", offset = 0, keep = "positive") {
        const result = cutShapeWithPlane(this.wrapped, plane, offset, keep);
        if (!result) return null;
        const newShape = cast(result);
        if (!(newShape instanceof Solid) && !(newShape instanceof Compound)) {
            newShape.delete();
            throw new Error("Could not cut plane as a solid shape");
        }
        return newShape;
    }
    meshShape(options) {
        const { triangles, vertices } = this.mesh(options);
        const tol = options?.tolerance ?? 1e-6;
        const scale = tol === 0 ? 0 : 1 / tol;
        const keyFor = (x, y, z)=>{
            if (scale === 0) return `${x}|${y}|${z}`;
            return `${Math.round(x * scale)}|${Math.round(y * scale)}|${Math.round(z * scale)}`;
        };
        const mergeFrom = [];
        const mergeTo = [];
        const seen = new Map();
        for(let i = 0; i < vertices.length; i += 3){
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = vertices[i + 2];
            const key = keyFor(x, y, z);
            const existing = seen.get(key);
            const idx = i / 3;
            if (existing !== undefined) {
                mergeFrom.push(idx);
                mergeTo.push(existing);
            } else {
                seen.set(key, idx);
            }
        }
        const numProp = 3;
        const vertProperties = new Float32Array(vertices);
        const meshData = {
            vertProperties,
            triVerts: new Uint32Array(triangles),
            numProp,
            mergeFromVert: mergeFrom.length ? new Uint32Array(mergeFrom) : undefined,
            mergeToVert: mergeTo.length ? new Uint32Array(mergeTo) : undefined
        };
        const manifold = getManifold();
        const mesh = new manifold.Mesh(meshData);
        const manifoldShape = new manifold.Manifold(mesh);
        return new MeshShape(manifoldShape);
    }
    shell(thicknessOrConfig, toleranceOrFinderFcn = null, tolerance = 1e-3) {
        const tol = typeof toleranceOrFinderFcn === "number" ? toleranceOrFinderFcn : tolerance;
        let filter;
        let thickness;
        if (typeof thicknessOrConfig === "number") {
            thickness = thicknessOrConfig;
            const ff = new FaceFinder();
            filter = typeof toleranceOrFinderFcn === "function" ? toleranceOrFinderFcn(ff, this) : ff;
        } else {
            thickness = thicknessOrConfig.thickness;
            filter = thicknessOrConfig.filter;
        }
        const filteredFaces = filter.find(this);
        const newShape = cast(shellShape(this.wrapped, {
            faces: filteredFaces,
            thickness,
            tolerance: tol
        }));
        if (!isShape3D(newShape)) throw new Error("Could not shell as a 3d shape");
        return newShape;
    }
    fillet(radiusConfig, filter) {
        let config = radiusConfig;
        if (isFilletRadius(radiusConfig) && filter) {
            config = {
                radius: radiusConfig,
                filter: filter(new EdgeFinder(), this)
            };
        }
        const selectedEdges = selectEdgeRadii(this.wrapped, config, isFilletRadius, (edge)=>new Edge(edge));
        const newShape = cast(filletShape(this.wrapped, selectedEdges));
        if (!isShape3D(newShape)) throw new Error("Could not fillet as a 3d shape");
        return newShape;
    }
    chamfer(radiusConfig, filter) {
        let config = radiusConfig;
        if (isChamferRadius(radiusConfig) && filter) {
            config = {
                radius: radiusConfig,
                filter: filter(new EdgeFinder(), this)
            };
        }
        const selectedEdges = selectEdgeRadii(this.wrapped, config, isChamferRadius, (edge)=>new Edge(edge));
        const chamfers = mapSelectedEdges(selectedEdges, ({ radius, edge })=>{
            if (typeof radius === "number") return {
                radius,
                edge
            };
            const face = radius.selectedFace(new FaceFinder(), this).find(this, {
                unique: true
            });
            if (!face) throw new Error("Could not find face for chamfer");
            return "distances" in radius ? {
                edge,
                face,
                distances: radius.distances
            } : {
                edge,
                face,
                distance: radius.distance,
                angle: radius.angle
            };
        });
        const newShape = cast(chamferShape(this.wrapped, chamfers));
        if (!isShape3D(newShape)) throw new Error("Could not chamfer as a 3d shape");
        return newShape;
    }
    draft(angle, faceFinder, neutralPlane = "XY") {
        const faces = faceFinder(new FaceFinder(), this).find(this);
        const newShape = cast(draftShape(this.wrapped, {
            faces,
            angle,
            neutralPlane
        }));
        if (!isShape3D(newShape)) throw new Error("Could not draft as a 3d shape");
        return newShape;
    }
}
export class Shell extends _3DShape {
}
export class Solid extends _3DShape {
}
export class CompSolid extends _3DShape {
}
export class Compound extends _3DShape {
}
export function isShape3D(shape) {
    return shape instanceof Shell || shape instanceof Solid || shape instanceof CompSolid || shape instanceof Compound;
}
export function isWire(shape) {
    return shape instanceof Wire;
}
export const cast = makeCaster({
    vertex: Vertex,
    edge: Edge,
    wire: Wire,
    face: Face,
    shell: Shell,
    solid: Solid,
    solidCompound: CompSolid,
    compound: Compound
});
