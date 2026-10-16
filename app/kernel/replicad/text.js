import { organiseBlueprints } from "./blueprints/index.js";
import { BlueprintSketcher } from "./Sketcher2d.js";
import { Plane } from "./geom.js";


import opentype from "./_deps/opentype.js";
const FONT_REGISTER = {};
export async function loadFont(fontPath, fontFamily = "default", force = false) {
    if (!force && FONT_REGISTER[fontFamily]) {
        console.log(`Font ${fontFamily} already loaded`);
        return FONT_REGISTER[fontFamily];
    }
    let fontData;
    if (typeof fontPath === "string") {
        const response = await fetch(fontPath);
        fontData = await response.arrayBuffer();
    } else {
        fontData = fontPath;
    }
    const font = opentype.parse(fontData);
    FONT_REGISTER[fontFamily] = font;
    if (!FONT_REGISTER.default) FONT_REGISTER.default = font;
    return font;
}
export const getFont = (fontFamily = "default")=>{
    return FONT_REGISTER[fontFamily];
};
const sketchFontCommands = function*(commands) {
    let sk = null;
    let lastPoint = null;
    for (const command of commands){
        if (command.type === "Z") {
            if (sk) yield sk.close();
            sk = null;
            continue;
        }
        const p = [
            -command.x,
            command.y
        ];
        if (command.type === "M") {
            if (sk) {
                yield sk.done();
            }
            sk = new BlueprintSketcher();
            sk.movePointerTo(p);
            lastPoint = p;
            continue;
        }
        if (lastPoint && Math.abs(p[0] - lastPoint[0]) < 1e-9 && Math.abs(p[1] - lastPoint[1]) < 1e-9) continue;
        if (command.type === "L") {
            sk?.lineTo(p);
        }
        if (command.type === "C") {
            sk?.cubicBezierCurveTo(p, [
                -command.x1,
                command.y1
            ], [
                -command.x2,
                command.y2
            ]);
        }
        if (command.type === "Q") {
            sk?.quadraticBezierCurveTo(p, [
                -command.x1,
                command.y1
            ]);
        }
        lastPoint = p;
    }
};
export function textBlueprints(text, { startX = 0, startY = 0, fontSize = 16, fontFamily = "default" } = {}) {
    let font = getFont(fontFamily);
    if (!font) {
        console.warn(`Font family "${fontFamily}" not found, please load it first, using the default`);
        font = getFont();
    }
    const writtenText = font.getPath(text, -startX, -startY, fontSize);
    const blueprints = Array.from(sketchFontCommands(writtenText.commands));
    return organiseBlueprints(blueprints).mirror([
        0,
        0
    ]);
}
export function sketchText(text, textConfig, planeConfig = {}) {
    const textBp = textBlueprints(text, textConfig);
    return planeConfig.plane instanceof Plane ? textBp.sketchOnPlane(planeConfig.plane) : textBp.sketchOnPlane(planeConfig.plane, planeConfig.origin);
}
