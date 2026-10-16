import Flatbush from "../_deps/flatbush.js";

export const stitchCurves = (curves, precision = 1e-7)=>{
    const startPoints = new Flatbush(curves.length);
    curves.forEach((c)=>{
        const [x, y] = c.firstPoint;
        startPoints.add(x - precision, y - precision, x + precision, y + precision);
    });
    startPoints.finish();
    const stitchedCurves = [];
    const visited = new Set();
    curves.forEach((curve, index)=>{
        if (visited.has(index)) return;
        const connectedCurves = [
            curve
        ];
        let currentIndex = index;
        visited.add(index);
        let maxLoops = curves.length;
        while(true){
            if (maxLoops-- < 0) {
                throw new Error("Infinite loop detected");
            }
            const lastPoint = connectedCurves[connectedCurves.length - 1].lastPoint;
            const [x, y] = lastPoint;
            const neighbors = startPoints.search(x - precision, y - precision, x + precision, y + precision);
            const indexDistance = (otherIndex)=>Math.abs((currentIndex - otherIndex) % curves.length);
            const potentialNextCurves = neighbors.filter((neighborIndex)=>!visited.has(neighborIndex)).map((neighborIndex)=>[
                    curves[neighborIndex],
                    neighborIndex,
                    indexDistance(neighborIndex)
                ]).sort(([, , a], [, , b])=>indexDistance(a) - indexDistance(b));
            if (potentialNextCurves.length === 0) {
                stitchedCurves.push(connectedCurves);
                break;
            }
            const [nextCurve, nextCurveIndex] = potentialNextCurves[0];
            connectedCurves.push(nextCurve);
            visited.add(nextCurveIndex);
            currentIndex = nextCurveIndex;
        }
    });
    return stitchedCurves;
};
