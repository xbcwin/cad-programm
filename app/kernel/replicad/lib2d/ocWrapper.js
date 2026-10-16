
import { getOC } from "../oclib.js";
import { localGC } from "../register.js";

export const pnt = ([x, y])=>{
    const oc = getOC();
    return new oc.gp_Pnt2d(x, y);
};
export const direction2d = ([x, y])=>{
    const oc = getOC();
    return new oc.gp_Dir2d(x, y);
};
export const vec = ([x, y])=>{
    const oc = getOC();
    return new oc.gp_Vec2d(x, y);
};
export const axis2d = (point, direction)=>{
    const oc = getOC();
    const [r, gc] = localGC();
    const axis = new oc.gp_Ax2d(r(pnt(point)), r(direction2d(direction)));
    gc();
    return axis;
};
