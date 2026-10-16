import { downcast, shapeType, topologyKind } from "./topology.js";
export function makeCaster(constructors) {
    return (shape)=>{
        const kind = topologyKind(shape);
        if (!kind) throw new Error(`Unsupported topology type: ${shapeType(shape)}`);
        return new constructors[kind](downcast(shape));
    };
}
