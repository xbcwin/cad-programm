import { getOC } from "./oclib.js";

if (!globalThis.FinalizationRegistry) {
    console.log("Garbage collection will not work");
    globalThis.FinalizationRegistry = ()=>({
            register: ()=>null,
            unregister: ()=>null
        });
}
const deletetableRegistry = new globalThis.FinalizationRegistry((heldValue)=>{
    if (!heldValue) return;
    try {
        heldValue.delete();
    } catch (e) {
        console.error(e);
    }
});
export class WrappingObj {
    oc;
    _wrapped;
    constructor(wrapped){
        this.oc = getOC();
        if (wrapped) {
            deletetableRegistry.register(this, wrapped, wrapped);
        }
        this._wrapped = wrapped;
    }
    get wrapped() {
        if (this._wrapped === null) throw new Error("This object has been deleted");
        return this._wrapped;
    }
    set wrapped(newWrapped) {
        if (this._wrapped) {
            deletetableRegistry.unregister(this._wrapped);
            this._wrapped.delete();
        }
        if (newWrapped) {
            deletetableRegistry.register(this, newWrapped, newWrapped);
        }
        this._wrapped = newWrapped;
    }
    delete() {
        const wrapped = this._wrapped;
        if (wrapped === null) return;
        this._wrapped = null;
        deletetableRegistry.unregister(wrapped);
        wrapped.delete();
    }
}
if (typeof Symbol.dispose === "symbol") {
    Object.defineProperty(WrappingObj.prototype, Symbol.dispose, {
        configurable: true,
        writable: true,
        value () {
            this.delete();
        }
    });
}
export const GCWithScope = ()=>{
    function gcWithScope(value) {
        if (value) {
            deletetableRegistry.register(gcWithScope, value);
        }
        return value;
    }
    return gcWithScope;
};
export const GCWithObject = (obj)=>{
    function registerForGC(value) {
        if (value) {
            deletetableRegistry.register(obj, value);
        }
        return value;
    }
    return registerForGC;
};
export const localGC = (debug)=>{
    const cleaner = new Set();
    return [
        (v)=>{
            cleaner.add(v);
            return v;
        },
        ()=>{
            [
                ...cleaner.values()
            ].forEach((d)=>d.delete());
            cleaner.clear();
        },
        debug ? cleaner : undefined
    ];
};
