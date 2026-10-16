import { BoundingBox, Transformation, Vector } from "./geom.js";
import { WrappingObj } from "./register.js";
import { getManifold } from "./manifoldlib.js";
const asVec3 = (v)=>{
    const vec = new Vector(v);
    const res = [
        vec.x,
        vec.y,
        vec.z
    ];
    return res;
};
const manifoldTransformFromTransformation = (t)=>{
    const transform = t.inverted();
    const origin = transform.transformPoint([
        0,
        0,
        0
    ]);
    const xPoint = transform.transformPoint([
        1,
        0,
        0
    ]);
    const yPoint = transform.transformPoint([
        0,
        1,
        0
    ]);
    const zPoint = transform.transformPoint([
        0,
        0,
        1
    ]);
    const o = [
        origin.X(),
        origin.Y(),
        origin.Z()
    ];
    const x = [
        xPoint.X() - o[0],
        xPoint.Y() - o[1],
        xPoint.Z() - o[2]
    ];
    const y = [
        yPoint.X() - o[0],
        yPoint.Y() - o[1],
        yPoint.Z() - o[2]
    ];
    const z = [
        zPoint.X() - o[0],
        zPoint.Y() - o[1],
        zPoint.Z() - o[2]
    ];
    origin.delete();
    xPoint.delete();
    yPoint.delete();
    zPoint.delete();
    return [
        x[0],
        y[0],
        z[0],
        o[0],
        x[1],
        y[1],
        z[1],
        o[1],
        x[2],
        y[2],
        z[2],
        o[2]
    ];
};
const applyTransformation = (shape, transform)=>{
    const manifoldTransform = manifoldTransformFromTransformation(transform);
    return shape.transform(manifoldTransform);
};
export class MeshShape extends WrappingObj {
    constructor(manifoldShape){
        super(manifoldShape);
        manifoldShape.numVert();
    }
    clone() {
        const mesh = this.wrapped.getMesh();
        const manifold = getManifold();
        const copy = new manifold.Manifold(mesh);
        return new MeshShape(copy);
    }
    fuse(other, _options) {
        const newShape = this.wrapped.add(other.wrapped);
        return new MeshShape(newShape);
    }
    cut(other, _options) {
        const newShape = this.wrapped.subtract(other.wrapped);
        return new MeshShape(newShape);
    }
    intersect(other) {
        const newShape = this.wrapped.intersect(other.wrapped);
        return new MeshShape(newShape);
    }
    translate(vectorOrxDist, yDist = 0, zDist = 0) {
        const translation = typeof vectorOrxDist === "number" ? [
            vectorOrxDist,
            yDist,
            zDist
        ] : asVec3(vectorOrxDist);
        const newShape = this.wrapped.translate(translation);
        return new MeshShape(newShape);
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
    rotate(angleOrVector, position = [
        0,
        0,
        0
    ], direction = [
        0,
        0,
        1
    ]) {
        if (typeof angleOrVector !== "number") {
            const newShape = this.wrapped.rotate(asVec3(angleOrVector));
            return new MeshShape(newShape);
        }
        const transform = new Transformation();
        transform.rotate(angleOrVector, position, direction);
        const newShape = applyTransformation(this.wrapped, transform);
        return new MeshShape(newShape);
    }
    scale(scale, center) {
        const transform = new Transformation();
        transform.scale(center ?? [
            0,
            0,
            0
        ], scale);
        const newShape = applyTransformation(this.wrapped, transform);
        return new MeshShape(newShape);
    }
    mirror(inputPlane, origin) {
        const transform = new Transformation();
        transform.mirror(inputPlane, origin);
        const newShape = applyTransformation(this.wrapped, transform);
        return new MeshShape(newShape);
    }
    simplify(tolerance) {
        const newShape = this.wrapped.simplify(tolerance);
        return new MeshShape(newShape);
    }
    refine(n) {
        return new MeshShape(this.wrapped.refine(n));
    }
    refineToLength(length) {
        return new MeshShape(this.wrapped.refineToLength(length));
    }
    refineToTolerance(tolerance) {
        return new MeshShape(this.wrapped.refineToTolerance(tolerance));
    }
    hull() {
        return new MeshShape(this.wrapped.hull());
    }
    asOriginal() {
        return new MeshShape(this.wrapped.asOriginal());
    }
    mesh() {
        const meshSource = this.wrapped.calculateNormals(0, 0.1);
        const mesh = meshSource.getMesh();
        const numProp = mesh.numProp ?? 3;
        const vertProperties = Array.from(mesh.vertProperties);
        const triangles = Array.from(mesh.triVerts);
        const vertices = [];
        const numVert = mesh.numVert ?? Math.floor(vertProperties.length / numProp);
        const normalOffset = numProp >= 6 ? 3 : -1;
        const normals = [];
        for(let i = 0; i < numVert; i++){
            const base = i * numProp;
            vertices.push(vertProperties[base], vertProperties[base + 1], vertProperties[base + 2]);
            if (normalOffset >= 0 && normalOffset + 2 < numProp) {
                normals.push(vertProperties[base + normalOffset], vertProperties[base + normalOffset + 1], vertProperties[base + normalOffset + 2]);
            }
        }
        return {
            vertices,
            triangles,
            normals,
            vertProperties,
            numProp
        };
    }
    get boundingBox() {
        const bbox = this.wrapped.boundingBox();
        return BoundingBox.fromBounds([
            bbox.min[0],
            bbox.min[1],
            bbox.min[2]
        ], [
            bbox.max[0],
            bbox.max[1],
            bbox.max[2]
        ]);
    }
    volume() {
        return this.wrapped.volume();
    }
    surfaceArea() {
        return this.wrapped.surfaceArea();
    }
    numTri() {
        return this.wrapped.numTri();
    }
    numVert() {
        return this.wrapped.numVert();
    }
    numEdge() {
        return this.wrapped.numEdge();
    }
    get isEmpty() {
        return this.wrapped.isEmpty();
    }
    blobSTL({ binary = false } = {}) {
        const { vertices, triangles } = this.mesh();
        const numTriangles = triangles.length / 3;
        if (binary) {
            const bufferSize = 80 + 4 + numTriangles * 50;
            const buffer = new ArrayBuffer(bufferSize);
            const view = new DataView(buffer);
            view.setUint32(80, numTriangles, true);
            let offset = 84;
            for(let i = 0; i < numTriangles; i++){
                const i0 = triangles[i * 3];
                const i1 = triangles[i * 3 + 1];
                const i2 = triangles[i * 3 + 2];
                const ax = vertices[i0 * 3], ay = vertices[i0 * 3 + 1], az = vertices[i0 * 3 + 2];
                const bx = vertices[i1 * 3], by = vertices[i1 * 3 + 1], bz = vertices[i1 * 3 + 2];
                const cx = vertices[i2 * 3], cy = vertices[i2 * 3 + 1], cz = vertices[i2 * 3 + 2];
                const ux = bx - ax, uy = by - ay, uz = bz - az;
                const vx = cx - ax, vy = cy - ay, vz = cz - az;
                let nx = uy * vz - uz * vy;
                let ny = uz * vx - ux * vz;
                let nz = ux * vy - uy * vx;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                if (len > 0) {
                    nx /= len;
                    ny /= len;
                    nz /= len;
                }
                view.setFloat32(offset, nx, true);
                offset += 4;
                view.setFloat32(offset, ny, true);
                offset += 4;
                view.setFloat32(offset, nz, true);
                offset += 4;
                view.setFloat32(offset, ax, true);
                offset += 4;
                view.setFloat32(offset, ay, true);
                offset += 4;
                view.setFloat32(offset, az, true);
                offset += 4;
                view.setFloat32(offset, bx, true);
                offset += 4;
                view.setFloat32(offset, by, true);
                offset += 4;
                view.setFloat32(offset, bz, true);
                offset += 4;
                view.setFloat32(offset, cx, true);
                offset += 4;
                view.setFloat32(offset, cy, true);
                offset += 4;
                view.setFloat32(offset, cz, true);
                offset += 4;
                view.setUint16(offset, 0, true);
                offset += 2;
            }
            return new Blob([
                buffer
            ], {
                type: "application/sla"
            });
        }
        const lines = [
            "solid mesh"
        ];
        for(let i = 0; i < numTriangles; i++){
            const i0 = triangles[i * 3];
            const i1 = triangles[i * 3 + 1];
            const i2 = triangles[i * 3 + 2];
            const ax = vertices[i0 * 3], ay = vertices[i0 * 3 + 1], az = vertices[i0 * 3 + 2];
            const bx = vertices[i1 * 3], by = vertices[i1 * 3 + 1], bz = vertices[i1 * 3 + 2];
            const cx = vertices[i2 * 3], cy = vertices[i2 * 3 + 1], cz = vertices[i2 * 3 + 2];
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const vx = cx - ax, vy = cy - ay, vz = cz - az;
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (len > 0) {
                nx /= len;
                ny /= len;
                nz /= len;
            }
            lines.push(`facet normal ${nx} ${ny} ${nz}`);
            lines.push("  outer loop");
            lines.push(`    vertex ${ax} ${ay} ${az}`);
            lines.push(`    vertex ${bx} ${by} ${bz}`);
            lines.push(`    vertex ${cx} ${cy} ${cz}`);
            lines.push("  endloop");
            lines.push("endfacet");
        }
        lines.push("endsolid mesh");
        return new Blob([
            lines.join("\n")
        ], {
            type: "application/sla"
        });
    }
}
