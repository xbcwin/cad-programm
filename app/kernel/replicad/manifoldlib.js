const MANIFOLD = {
    library: null
};
export const setManifold = (manifold)=>{
    manifold?.setup?.();
    MANIFOLD.library = manifold;
};
export const getManifold = ()=>{
    if (!MANIFOLD.library) throw new Error("manifold has not been loaded");
    return MANIFOLD.library;
};
