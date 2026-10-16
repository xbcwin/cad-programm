import { asDir, asPnt, makeAx2, makeDirVector, Vector } from "../geom.js";
import { WrappingObj } from "../register.js";
const PROJECTION_PLANES = {
    XY: {
        dir: [
            0,
            0,
            1
        ],
        xAxis: [
            1,
            0,
            0
        ]
    },
    XZ: {
        dir: [
            0,
            -1,
            0
        ],
        xAxis: [
            1,
            0,
            0
        ]
    },
    YZ: {
        dir: [
            1,
            0,
            0
        ],
        xAxis: [
            0,
            1,
            0
        ]
    },
    YX: {
        dir: [
            0,
            0,
            -1
        ],
        xAxis: [
            0,
            1,
            0
        ]
    },
    ZX: {
        dir: [
            0,
            1,
            0
        ],
        xAxis: [
            0,
            0,
            1
        ]
    },
    ZY: {
        dir: [
            -1,
            0,
            0
        ],
        xAxis: [
            0,
            0,
            1
        ]
    },
    front: {
        dir: [
            0,
            -1,
            0
        ],
        xAxis: [
            1,
            0,
            0
        ]
    },
    back: {
        dir: [
            0,
            1,
            0
        ],
        xAxis: [
            -1,
            0,
            0
        ]
    },
    right: {
        dir: [
            -1,
            0,
            0
        ],
        xAxis: [
            0,
            -1,
            0
        ]
    },
    left: {
        dir: [
            1,
            0,
            0
        ],
        xAxis: [
            0,
            1,
            0
        ]
    },
    bottom: {
        dir: [
            0,
            0,
            1
        ],
        xAxis: [
            1,
            0,
            0
        ]
    },
    top: {
        dir: [
            0,
            0,
            -1
        ],
        xAxis: [
            1,
            0,
            0
        ]
    }
};
export function isProjectionPlane(plane) {
    return typeof plane === "string" && plane in PROJECTION_PLANES;
}
export function lookFromPlane(projectionPlane) {
    const { dir, xAxis } = PROJECTION_PLANES[projectionPlane];
    return new ProjectionCamera([
        0,
        0,
        0
    ], dir, xAxis);
}
function defaultXDir(direction) {
    const dir = makeDirVector(direction);
    let yAxis = new Vector([
        0,
        0,
        1
    ]);
    let xAxis = yAxis.cross(dir);
    if (xAxis.Length === 0) {
        yAxis = new Vector([
            0,
            1,
            0
        ]);
        xAxis = yAxis.cross(dir);
    }
    return xAxis.normalize();
}
export class ProjectionCamera extends WrappingObj {
    constructor(position = [
        0,
        0,
        0
    ], direction = [
        0,
        0,
        1
    ], xAxis){
        const xDir = xAxis ? makeDirVector(xAxis) : defaultXDir(direction);
        const ax2 = makeAx2(position, direction, xDir);
        super(ax2);
    }
    get position() {
        return new Vector(this.wrapped.Location());
    }
    get direction() {
        return new Vector(this.wrapped.Direction());
    }
    get xAxis() {
        return new Vector(this.wrapped.XDirection());
    }
    get yAxis() {
        return new Vector(this.wrapped.YDirection());
    }
    autoAxes() {
        const xAxis = defaultXDir(this.direction);
        this.wrapped.SetXDirection(asDir(xAxis));
    }
    setPosition(position) {
        this.wrapped.SetLocation(asPnt(position));
        return this;
    }
    setXAxis(xAxis) {
        this.wrapped.SetYDirection(asDir(xAxis));
        return this;
    }
    setYAxis(yAxis) {
        this.wrapped.SetYDirection(asDir(yAxis));
        return this;
    }
    lookAt(shape) {
        const lootAtPoint = new Vector("boundingBox" in shape ? shape.boundingBox.center : shape);
        const direction = this.position.sub(lootAtPoint).normalized();
        this.wrapped.SetDirection(direction.toDir());
        this.autoAxes();
        return this;
    }
}
