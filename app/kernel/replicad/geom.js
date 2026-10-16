import { WrappingObj, GCWithScope } from "./register.js";
import { DEG2RAD, RAD2DEG } from "./constants.js";
import { getOC } from "./oclib.js";

const round3 = (v)=>Math.round(v * 1000) / 1000;
export function isPoint(p) {
    if (Array.isArray(p)) return p.length === 3 || p.length === 2;
    else if (p instanceof Vector) return true;
    else if (p && typeof p?.XYZ === "function") return true;
    return false;
}
export const makeAx3 = (center, dir, xDir)=>{
    const oc = getOC();
    const origin = asPnt(center);
    const direction = asDir(dir);
    let axis;
    if (xDir) {
        const xDirection = asDir(xDir);
        axis = new oc.gp_Ax3(origin, direction, xDirection);
        xDirection.delete();
    } else {
        axis = new oc.gp_Ax3(origin, direction);
    }
    origin.delete();
    direction.delete();
    return axis;
};
export function makePln(origin, dir) {
    const orig = asPnt(origin);
    const direction = asDir(dir);
    const oc = getOC();
    const pln = new oc.gp_Pln(orig, direction);
    orig.delete();
    direction.delete();
    return pln;
}
export const makeAx2 = (center, dir, xDir)=>{
    const oc = getOC();
    const origin = asPnt(center);
    const direction = asDir(dir);
    let axis;
    if (xDir) {
        const xDirection = asDir(xDir);
        axis = new oc.gp_Ax2(origin, direction, xDirection);
        xDirection.delete();
    } else {
        axis = new oc.gp_Ax2(origin, direction);
    }
    origin.delete();
    direction.delete();
    return axis;
};
export const makeAx1 = (center, dir)=>{
    const oc = getOC();
    const origin = asPnt(center);
    const direction = asDir(dir);
    const axis = new oc.gp_Ax1(origin, direction);
    origin.delete();
    direction.delete();
    return axis;
};
const makeVec = (vector = [
    0,
    0,
    0
])=>{
    const oc = getOC();
    if (Array.isArray(vector)) {
        if (vector.length === 3) return new oc.gp_Vec(...vector);
        else if (vector.length === 2) return new oc.gp_Vec(...vector, 0);
    } else if (vector instanceof Vector) {
        return new oc.gp_Vec(vector.wrapped.XYZ());
    } else if (vector.XYZ) return new oc.gp_Vec(vector.XYZ());
    return new oc.gp_Vec(0, 0, 0);
};
export class Vector extends WrappingObj {
    constructor(vector = [
        0,
        0,
        0
    ]){
        super(makeVec(vector));
    }
    get repr() {
        return `x: ${round3(this.x)}, y: ${round3(this.y)}, z: ${round3(this.z)}`;
    }
    get x() {
        return this.wrapped.X();
    }
    get y() {
        return this.wrapped.Y();
    }
    get z() {
        return this.wrapped.Z();
    }
    get Length() {
        return this.wrapped.Magnitude();
    }
    toTuple() {
        return [
            this.x,
            this.y,
            this.z
        ];
    }
    cross(v) {
        return new Vector(this.wrapped.Crossed(v.wrapped));
    }
    dot(v) {
        return this.wrapped.Dot(v.wrapped);
    }
    sub(v) {
        return new Vector(this.wrapped.Subtracted(v.wrapped));
    }
    add(v) {
        return new Vector(this.wrapped.Added(v.wrapped));
    }
    multiply(scale) {
        return new Vector(this.wrapped.Multiplied(scale));
    }
    normalized() {
        return new Vector(this.wrapped.Normalized());
    }
    normalize() {
        this.wrapped.Normalize();
        return this;
    }
    getCenter() {
        return this;
    }
    getAngle(v) {
        return this.wrapped.Angle(v.wrapped) * RAD2DEG;
    }
    projectToPlane(plane) {
        const base = plane.origin;
        const normal = plane.zDir;
        const v1 = this.sub(base);
        const v2 = normal.multiply(v1.dot(normal) / normal.Length ** 2);
        const projection = this.sub(v2);
        v1.delete();
        v2.delete();
        return projection;
    }
    equals(other) {
        return this.wrapped.IsEqual(other.wrapped, 0.00001, 0.00001);
    }
    toPnt() {
        return new this.oc.gp_Pnt(this.wrapped.XYZ());
    }
    toDir() {
        return new this.oc.gp_Dir(this.wrapped.XYZ());
    }
    rotate(angle, center = [
        0,
        0,
        0
    ], direction = [
        0,
        0,
        1
    ]) {
        const ax = makeAx1(center, direction);
        this.wrapped.Rotate(ax, angle * DEG2RAD);
        ax.delete();
        return this;
    }
}
export const AXIS_NAMES = [
    "X",
    "Y",
    "Z",
    "-X",
    "-Y",
    "-Z"
];
const DIRECTIONS = {
    X: [
        1,
        0,
        0
    ],
    Y: [
        0,
        1,
        0
    ],
    Z: [
        0,
        0,
        1
    ],
    "-X": [
        -1,
        0,
        0
    ],
    "-Y": [
        0,
        -1,
        0
    ],
    "-Z": [
        0,
        0,
        -1
    ]
};
export function resolveDirection(direction) {
    if (typeof direction !== "string") return direction;
    const resolved = DIRECTIONS[direction];
    if (!resolved) {
        throw new Error(`Invalid direction "${direction}". Expected one of: ${AXIS_NAMES.join(", ")}.`);
    }
    return resolved;
}
export const makeDirection = resolveDirection;
export function makeDirVector(direction) {
    return new Vector(resolveDirection(direction));
}
export function asPnt(coords) {
    const v = new Vector(coords);
    const pnt = v.toPnt();
    v.delete();
    return pnt;
}
export function asDir(direction) {
    const v = makeDirVector(direction);
    const dir = v.toDir();
    v.delete();
    return dir;
}
export class Transformation extends WrappingObj {
    constructor(transform){
        const oc = getOC();
        super(transform || new oc.gp_Trsf());
    }
    clone() {
        const clone = this.wrapped.Inverted();
        clone.Invert();
        return new Transformation(clone);
    }
    translate(xDistOrVector, yDist = 0, zDist = 0) {
        const translation = new Vector(typeof xDistOrVector === "number" ? [
            xDistOrVector,
            yDist,
            zDist
        ] : xDistOrVector);
        this.wrapped.SetTranslation(translation.wrapped);
        return this;
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
        const dir = asDir(direction);
        const origin = asPnt(position);
        const axis = new this.oc.gp_Ax1(origin, dir);
        this.wrapped.SetRotation(axis, angle * DEG2RAD);
        axis.delete();
        dir.delete();
        origin.delete();
        return this;
    }
    mirror(inputPlane = "YZ", inputOrigin) {
        const r = GCWithScope();
        let origin;
        let direction;
        if (typeof inputPlane === "string") {
            const plane = r(createNamedPlane(inputPlane, inputOrigin));
            origin = plane.origin;
            direction = plane.zDir;
        } else if (inputPlane instanceof Plane) {
            origin = inputOrigin || inputPlane.origin;
            direction = inputPlane.zDir;
        } else {
            origin = inputOrigin || [
                0,
                0,
                0
            ];
            direction = inputPlane;
        }
        const mirrorAxis = r(makeAx2(origin, direction));
        this.wrapped.SetMirror(mirrorAxis);
        return this;
    }
    scale(center, scale) {
        const pnt = asPnt(center);
        this.wrapped.SetScale(pnt, scale);
        pnt.delete();
        return this;
    }
    inverse() {
        this.wrapped.Invert();
        return this;
    }
    inverted() {
        return new Transformation(this.wrapped.Inverted());
    }
    coordSystemChange(fromSystem, toSystem) {
        const r = GCWithScope();
        const fromAx = r(fromSystem === "reference" ? new this.oc.gp_Ax3() : makeAx3(fromSystem.origin, fromSystem.zDir, fromSystem.xDir));
        const toAx = r(toSystem === "reference" ? new this.oc.gp_Ax3() : makeAx3(toSystem.origin, toSystem.zDir, toSystem.xDir));
        this.wrapped.SetTransformation(fromAx, toAx);
        return this;
    }
    transformPoint(point) {
        const pnt = asPnt(point);
        const newPoint = pnt.Transformed(this.wrapped);
        pnt.delete();
        return newPoint;
    }
    transform(shape) {
        const transformer = new this.oc.BRepBuilderAPI_Transform(shape, this.wrapped, true, false);
        return transformer.ModifiedShape(shape);
    }
}
export class Plane {
    oc;
    xDir;
    yDir;
    zDir;
    _origin;
    localToGlobal;
    globalToLocal;
    constructor(origin, xDirection = null, normal = [
        0,
        0,
        1
    ]){
        this.oc = getOC();
        const zDir = makeDirVector(normal);
        if (zDir.Length === 0) {
            throw new Error("normal should be non null");
        }
        this.zDir = zDir.normalize();
        let xDir;
        if (!xDirection) {
            const ax3 = makeAx3(origin, this.zDir);
            const defaultXDirection = ax3.XDirection();
            xDir = makeDirVector(defaultXDirection);
            defaultXDirection.delete();
            ax3.delete();
        } else {
            xDir = makeDirVector(xDirection);
        }
        if (xDir.Length === 0) {
            throw new Error("xDir should be non null");
        }
        this.xDir = xDir.normalize();
        this.yDir = this.zDir.cross(this.xDir).normalize();
        this.origin = new Vector(origin);
    }
    delete() {
        this.localToGlobal.delete();
        this.xDir.delete();
        this.yDir.delete();
        this.zDir.delete();
        this._origin.delete();
    }
    clone() {
        return new Plane(this.origin, this.xDir, this.zDir);
    }
    get origin() {
        return this._origin;
    }
    set origin(newOrigin) {
        this._origin = newOrigin;
        this._calcTransforms();
    }
    translateTo(point) {
        const newPlane = this.clone();
        newPlane.origin = new Vector(point);
        return newPlane;
    }
    translate(xDistOrVector, yDist = 0, zDist = 0) {
        const translation = new Vector(typeof xDistOrVector === "number" ? [
            xDistOrVector,
            yDist,
            zDist
        ] : xDistOrVector);
        return this.translateTo(this.origin.add(translation));
    }
    translateX(xDist) {
        return this.translate(xDist, 0, 0);
    }
    translateY(yDist) {
        return this.translate(0, yDist, 0);
    }
    translateZ(zDist) {
        return this.translate(0, 0, zDist);
    }
    pivot(angle, direction = [
        1,
        0,
        0
    ]) {
        const zDir = new Vector(this.zDir).rotate(angle, [
            0,
            0,
            0
        ], direction);
        const xDir = new Vector(this.xDir).rotate(angle, [
            0,
            0,
            0
        ], direction);
        return new Plane(this.origin, xDir, zDir);
    }
    rotate2DAxes(angle) {
        const xDir = new Vector(this.xDir).rotate(angle, [
            0,
            0,
            0
        ], this.zDir);
        return new Plane(this.origin, xDir, this.zDir);
    }
    _calcTransforms() {
        const globalCoordSystem = new this.oc.gp_Ax3();
        const localCoordSystem = makeAx3(this.origin, this.zDir, this.xDir);
        const forwardT = new this.oc.gp_Trsf();
        forwardT.SetTransformation(globalCoordSystem, localCoordSystem);
        this.globalToLocal = new Transformation();
        this.globalToLocal.coordSystemChange("reference", {
            origin: this.origin,
            zDir: this.zDir,
            xDir: this.xDir
        });
        this.localToGlobal = new Transformation();
        this.localToGlobal.coordSystemChange({
            origin: this.origin,
            zDir: this.zDir,
            xDir: this.xDir
        }, "reference");
    }
    setOrigin2d(x, y) {
        this.origin = this.toWorldCoords([
            x,
            y
        ]);
    }
    toLocalCoords(vec) {
        const pnt = this.globalToLocal.transformPoint(vec);
        const newVec = new Vector(pnt);
        pnt.delete();
        return newVec;
    }
    toWorldCoords(v) {
        const pnt = this.localToGlobal.transformPoint(v);
        const newVec = new Vector(pnt);
        pnt.delete();
        return newVec;
    }
}
const PLANES_CONFIG = {
    XY: {
        xDir: [
            1,
            0,
            0
        ],
        normal: [
            0,
            0,
            1
        ]
    },
    YZ: {
        xDir: [
            0,
            1,
            0
        ],
        normal: [
            1,
            0,
            0
        ]
    },
    ZX: {
        xDir: [
            0,
            0,
            1
        ],
        normal: [
            0,
            1,
            0
        ]
    },
    XZ: {
        xDir: [
            1,
            0,
            0
        ],
        normal: [
            0,
            -1,
            0
        ]
    },
    YX: {
        xDir: [
            0,
            1,
            0
        ],
        normal: [
            0,
            0,
            -1
        ]
    },
    ZY: {
        xDir: [
            0,
            0,
            1
        ],
        normal: [
            -1,
            0,
            0
        ]
    },
    front: {
        xDir: [
            1,
            0,
            0
        ],
        normal: [
            0,
            0,
            1
        ]
    },
    back: {
        xDir: [
            -1,
            0,
            0
        ],
        normal: [
            0,
            0,
            -1
        ]
    },
    left: {
        xDir: [
            0,
            0,
            1
        ],
        normal: [
            -1,
            0,
            0
        ]
    },
    right: {
        xDir: [
            0,
            0,
            -1
        ],
        normal: [
            1,
            0,
            0
        ]
    },
    top: {
        xDir: [
            1,
            0,
            0
        ],
        normal: [
            0,
            1,
            0
        ]
    },
    bottom: {
        xDir: [
            1,
            0,
            0
        ],
        normal: [
            0,
            -1,
            0
        ]
    }
};
export const createNamedPlane = (plane, sourceOrigin = [
    0,
    0,
    0
])=>{
    const config = PLANES_CONFIG[plane];
    if (!config) throw new Error(`Could not find plane ${plane}`);
    let origin;
    if (typeof sourceOrigin === "number") {
        origin = config.normal.map((v)=>v * sourceOrigin);
    } else {
        origin = sourceOrigin;
    }
    return new Plane(origin, config.xDir, config.normal);
};
export class BoundingBox extends WrappingObj {
    constructor(wrapped){
        const oc = getOC();
        let boundBox = wrapped;
        if (!boundBox) {
            boundBox = new oc.Bnd_Box();
        }
        super(boundBox);
    }
    static fromBounds(min, max) {
        const box = new BoundingBox();
        box.wrapped.Update(min[0], min[1], min[2], max[0], max[1], max[2]);
        return box;
    }
    get repr() {
        const [min, max] = this.bounds;
        return `${new Vector(min).repr} - ${new Vector(max).repr}`;
    }
    get bounds() {
        const cornerMin = this.wrapped.CornerMin();
        const cornerMax = this.wrapped.CornerMax();
        const result = [
            [
                cornerMin.X(),
                cornerMin.Y(),
                cornerMin.Z()
            ],
            [
                cornerMax.X(),
                cornerMax.Y(),
                cornerMax.Z()
            ]
        ];
        cornerMin.delete();
        cornerMax.delete();
        return result;
    }
    get center() {
        const [[xmin, ymin, zmin], [xmax, ymax, zmax]] = this.bounds;
        return [
            xmin + (xmax - xmin) / 2,
            ymin + (ymax - ymin) / 2,
            zmin + (zmax - zmin) / 2
        ];
    }
    get width() {
        const [[xmin], [xmax]] = this.bounds;
        return Math.abs(xmax - xmin);
    }
    get height() {
        const [[, ymin], [, ymax]] = this.bounds;
        return Math.abs(ymax - ymin);
    }
    get depth() {
        const [[, , zmin], [, , zmax]] = this.bounds;
        return Math.abs(zmax - zmin);
    }
    add(other) {
        this.wrapped.Add(other.wrapped);
    }
    isOut(other) {
        return this.wrapped.IsOut(other.wrapped);
    }
}
