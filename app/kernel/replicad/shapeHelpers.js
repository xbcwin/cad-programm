import { Edge, Face, Wire, Solid, Vertex, cast, downcast, isShape3D, Shell } from "./shapes.js";
import { asPnt, makeAx3, makeAx2, Vector, makeAx1 } from "./geom.js";
import { getOC } from "./oclib.js";
import { GCWithScope, localGC, WrappingObj } from "./register.js";
import zip from "./utils/zip.js";

export const makeLine = (v1, v2)=>{
    const oc = getOC();
    return new Edge(new oc.BRepBuilderAPI_MakeEdge(asPnt(v1), asPnt(v2)).Edge());
};
export const makeCircle = (radius, center = [
    0,
    0,
    0
], normal = [
    0,
    0,
    1
])=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const ax = r(makeAx2(center, normal));
    const circleGp = r(new oc.gp_Circ(ax, radius));
    const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge(circleGp));
    const shape = new Edge(edgeMaker.Edge());
    gc();
    return shape;
};
export const makeEllipse = (majorRadius, minorRadius, center = [
    0,
    0,
    0
], normal = [
    0,
    0,
    1
], xDir)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const ax = r(makeAx2(center, normal, xDir));
    if (minorRadius > majorRadius) {
        throw new Error("The minor radius must be smaller than the major one");
    }
    const ellipseGp = r(new oc.gp_Elips(ax, majorRadius, minorRadius));
    const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge(ellipseGp));
    const shape = new Edge(edgeMaker.Edge());
    gc();
    return shape;
};
export const makeHelix = (pitch, height, radius, center = [
    0,
    0,
    0
], dir = [
    0,
    0,
    1
], lefthand = false)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    let myDir = 2 * Math.PI;
    if (lefthand) {
        myDir = -2 * Math.PI;
    }
    const geomLine = r(new oc.Geom2d_Line(r(new oc.gp_Pnt2d(0.0, 0.0)), r(new oc.gp_Dir2d(myDir, pitch))));
    const nTurns = height / pitch;
    const uStart = geomLine.Value(0.0);
    const uStop = geomLine.Value(nTurns * Math.sqrt((2 * Math.PI) ** 2 + pitch ** 2));
    const geomSeg = r(new oc.GC_MakeSegment2d(uStart, uStop));
    const geomSurf = new oc.Geom_CylindricalSurface(r(makeAx3(center, dir)), radius);
    const e = r(new oc.BRepBuilderAPI_MakeEdge(r(geomSeg.Value()), r(geomSurf))).Edge();
    const w = r(new oc.BRepBuilderAPI_MakeWire(e)).Wire();
    oc.BRepLib.BuildCurves3d(w);
    gc();
    return new Wire(w);
};
export const makeThreePointArc = (v1, v2, v3)=>{
    const oc = getOC();
    const circleGeom = new oc.GC_MakeArcOfCircle(asPnt(v1), asPnt(v2), asPnt(v3)).Value();
    const curve = circleGeom;
    return new Edge(new oc.BRepBuilderAPI_MakeEdge(curve).Edge());
};
export const makeEllipseArc = (majorRadius, minorRadius, startAngle, endAngle, center = [
    0,
    0,
    0
], normal = [
    0,
    0,
    1
], xDir)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const ax = r(makeAx2(center, normal, xDir));
    if (minorRadius > majorRadius) {
        throw new Error("The minor radius must be smaller than the major one");
    }
    const ellipseGp = r(new oc.gp_Elips(ax, majorRadius, minorRadius));
    const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge(ellipseGp, startAngle, endAngle));
    const shape = new Edge(edgeMaker.Edge());
    gc();
    return shape;
};
export const makeBSplineApproximation = function makeBSplineApproximation(points, { tolerance = 1e-3, smoothing = null, degMax = 6, degMin = 1 } = {}) {
    const oc = getOC();
    const [r, gc] = localGC();
    const pnts = r(new oc.NCollection_Array1_gp_Pnt(1, points.length));
    points.forEach((point, index)=>{
        pnts.SetValue(index + 1, r(asPnt(point)));
    });
    let splineBuilder;
    if (smoothing) {
        splineBuilder = r(new oc.GeomAPI_PointsToBSpline());
        splineBuilder.Init(pnts, smoothing[0], smoothing[1], smoothing[2], degMax, oc.GeomAbs_Shape.GeomAbs_C2, tolerance);
    } else {
        splineBuilder = r(new oc.GeomAPI_PointsToBSpline());
        splineBuilder.Init(pnts, degMin, degMax, oc.GeomAbs_Shape.GeomAbs_C2, tolerance);
    }
    if (!splineBuilder.IsDone()) {
        gc();
        throw new Error("B-spline approximation failed");
    }
    const splineGeom = r(splineBuilder.Curve());
    const curve = r(splineGeom);
    const edge = new Edge(new oc.BRepBuilderAPI_MakeEdge(curve).Edge());
    gc();
    return edge;
};
export const makeBezierCurve = (points)=>{
    const oc = getOC();
    const arrayOfPoints = new oc.NCollection_Array1_gp_Pnt(1, points.length);
    points.forEach((p, i)=>{
        arrayOfPoints.SetValue(i + 1, asPnt(p));
    });
    const bezCurve = new oc.Geom_BezierCurve(arrayOfPoints);
    const curve = bezCurve;
    return new Edge(new oc.BRepBuilderAPI_MakeEdge(curve).Edge());
};
export const makeTangentArc = (startPoint, startTgt, endPoint)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const circleGeom = r(new oc.GC_MakeArcOfCircle(r(asPnt(startPoint)), new Vector(startTgt).wrapped, r(asPnt(endPoint))).Value());
    const curve = r(circleGeom);
    const edge = new Edge(r(new oc.BRepBuilderAPI_MakeEdge(curve)).Edge());
    gc();
    return edge;
};
export const assembleWire = (listOfEdges)=>{
    const oc = getOC();
    const wireBuilder = new oc.BRepBuilderAPI_MakeWire();
    listOfEdges.forEach((e)=>{
        if (e instanceof Edge) {
            wireBuilder.Add(e.wrapped);
        }
        if (e instanceof Wire) {
            wireBuilder.Add(e.wrapped);
        }
    });
    wireBuilder.Build();
    const res = wireBuilder.Error();
    if (res !== oc.BRepBuilderAPI_WireError.BRepBuilderAPI_WireDone) {
        const errorNames = new Map([
            [
                oc.BRepBuilderAPI_WireError.BRepBuilderAPI_EmptyWire,
                "empty wire"
            ],
            [
                oc.BRepBuilderAPI_WireError.BRepBuilderAPI_NonManifoldWire,
                "non manifold wire"
            ],
            [
                oc.BRepBuilderAPI_WireError.BRepBuilderAPI_DisconnectedWire,
                "disconnected wire"
            ]
        ]);
        throw new Error(`Failed to build the wire, ${errorNames.get(res) || "unknown error"}`);
    }
    const wire = new Wire(wireBuilder.Wire());
    wireBuilder.delete();
    return wire;
};
export const makeFace = (wire, holes)=>{
    const oc = getOC();
    const faceBuilder = new oc.BRepBuilderAPI_MakeFace(wire.wrapped, false);
    holes?.forEach((hole)=>{
        faceBuilder.Add(hole.wrapped);
    });
    if (!faceBuilder.IsDone()) {
        faceBuilder.delete();
        throw new Error("Failed to build the face. Your wire might be non planar.");
    }
    const face = faceBuilder.Face();
    faceBuilder.delete();
    return new Face(face);
};
export const makeNewFaceWithinFace = (originFace, wire)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const surface = r(oc.BRep_Tool.Surface(originFace.wrapped));
    const faceBuilder = r(new oc.BRepBuilderAPI_MakeFace(surface, wire.wrapped, true));
    const face = faceBuilder.Face();
    gc();
    return new Face(face);
};
export const makeNonPlanarFace = (wire)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const faceBuilder = r(new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9));
    wire.edges.forEach((edge)=>{
        faceBuilder.Add(r(edge).wrapped, oc.GeomAbs_Shape.GeomAbs_C0, true);
    });
    faceBuilder.Build();
    const newFace = cast(faceBuilder.Shape());
    gc();
    if (!(newFace instanceof Face)) {
        throw new Error("Failed to create a face");
    }
    return newFace;
};
export const makeCylinder = (radius, height, location = [
    0,
    0,
    0
], direction = [
    0,
    0,
    1
])=>{
    const oc = getOC();
    const axis = makeAx2(location, direction);
    const cylinder = new oc.BRepPrimAPI_MakeCylinder(axis, radius, height);
    const solid = new Solid(cylinder.Shape());
    axis.delete();
    cylinder.delete();
    return solid;
};
export const makeSphere = (radius)=>{
    const oc = getOC();
    const sphereMaker = new oc.BRepPrimAPI_MakeSphere(radius);
    const sphere = new Solid(sphereMaker.Shape());
    sphereMaker.delete();
    return sphere;
};
class EllpsoidTransform extends WrappingObj {
    constructor(x, y, z){
        const oc = getOC();
        const r = GCWithScope();
        const xyRatio = Math.sqrt(x * y / z);
        const xzRatio = x / xyRatio;
        const yzRatio = y / xyRatio;
        const transform = new oc.gp_GTrsf();
        transform.SetAffinity(makeAx1([
            0,
            0,
            0
        ], [
            0,
            1,
            0
        ]), xzRatio);
        const xy = r(new oc.gp_GTrsf());
        xy.SetAffinity(makeAx1([
            0,
            0,
            0
        ], [
            0,
            0,
            1
        ]), xyRatio);
        const yz = r(new oc.gp_GTrsf());
        yz.SetAffinity(makeAx1([
            0,
            0,
            0
        ], [
            1,
            0,
            0
        ]), yzRatio);
        transform.Multiply(xy);
        transform.Multiply(yz);
        super(transform);
    }
    applyToPoint(p) {
        const oc = getOC();
        const r = GCWithScope();
        const coords = r(p.XYZ());
        this.wrapped.Transforms(coords);
        return new oc.gp_Pnt(coords);
    }
}
export const makeEllipsoid = (aLength, bLength, cLength)=>{
    const oc = getOC();
    const r = GCWithScope();
    const sphere = r(new oc.gp_Sphere());
    sphere.SetRadius(1);
    const sphericalSurface = r(new oc.Geom_SphericalSurface(sphere));
    const baseSurface = oc.GeomConvert.SurfaceToBSplineSurface(sphericalSurface.UReversed());
    const transform = new EllpsoidTransform(aLength, bLength, cLength);
    for(let u = 1; u <= baseSurface.NbUPoles(); u++){
        for(let v = 1; v <= baseSurface.NbVPoles(); v++){
            const newPoint = transform.applyToPoint(baseSurface.Pole(u, v));
            baseSurface.SetPole(u, v, newPoint);
        }
    }
    const shell = cast(r(new oc.BRepBuilderAPI_MakeShell(baseSurface.UReversed(), false)).Shell());
    return makeSolid([
        shell
    ]);
};
export const makeBox = (corner1, corner2)=>{
    const oc = getOC();
    const boxMaker = new oc.BRepPrimAPI_MakeBox(asPnt(corner1), asPnt(corner2));
    const box = new Solid(boxMaker.Solid());
    boxMaker.delete();
    return box;
};
export const makeVertex = (point)=>{
    const oc = getOC();
    const pnt = asPnt(point);
    const vertexMaker = new oc.BRepBuilderAPI_MakeVertex(pnt);
    const vertex = vertexMaker.Vertex();
    vertexMaker.delete();
    return new Vertex(vertex);
};
export const makeOffset = (face, offset, tolerance = 1e-6)=>{
    const oc = getOC();
    const offsetBuilder = new oc.BRepOffsetAPI_MakeOffsetShape();
    offsetBuilder.PerformByJoin(face.wrapped, offset, tolerance, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
    const newShape = cast(downcast(offsetBuilder.Shape()));
    offsetBuilder.delete();
    if (!isShape3D(newShape)) throw new Error("Could not offset to a 3d shape");
    return newShape;
};
export const compoundShapes = (shapeArray)=>{
    const oc = getOC();
    const builder = new oc.TopoDS_Builder();
    const compound = new oc.TopoDS_Compound();
    builder.MakeCompound(compound);
    shapeArray.forEach((s)=>{
        builder.Add(compound, s.wrapped);
        s.delete();
    });
    const newShape = cast(compound);
    return newShape;
};
export const makeCompound = compoundShapes;
function _weld(facesOrShells) {
    const oc = getOC();
    const r = GCWithScope();
    const shellBuilder = r(new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false));
    facesOrShells.forEach(({ wrapped })=>{
        shellBuilder.Add(wrapped);
    });
    shellBuilder.Perform();
    return cast(downcast(shellBuilder.SewedShape()));
}
export function weldShellsAndFaces(facesOrShells, ignoreType = false) {
    const shell = _weld(facesOrShells);
    if (!ignoreType && !(shell instanceof Shell)) throw new Error("Could not make a solid of faces and shells");
    return shell;
}
export function makeSolid(facesOrShells) {
    const r = GCWithScope();
    const oc = getOC();
    const shell = _weld(facesOrShells);
    const solid = cast(r(new oc.ShapeFix_Solid()).SolidFromShell(shell.wrapped));
    if (!(solid instanceof Solid)) throw new Error("Could not make a solid of faces and shells");
    return solid;
}
export const addHolesInFace = (face, holes)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const faceMaker = r(new oc.BRepBuilderAPI_MakeFace(face.wrapped));
    holes.forEach((wire)=>{
        faceMaker.Add(wire.wrapped);
    });
    const builtFace = r(faceMaker.Face());
    const fixer = r(new oc.ShapeFix_Face(builtFace));
    fixer.FixOrientation();
    const newFace = fixer.Face();
    gc();
    return new Face(newFace);
};
export const makePolygon = (points)=>{
    if (points.length < 3) throw new Error("You need at least 3 points to make a polygon");
    const edges = zip([
        points,
        [
            ...points.slice(1),
            points[0]
        ]
    ]).map(([p1, p2])=>makeLine(p1, p2));
    return makeFace(assembleWire(edges));
};
