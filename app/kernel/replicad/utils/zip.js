import range from "./range.js";
export default function zip(arrays) {
    const minLength = Math.min(...arrays.map((arr)=>arr.length));
    return range(minLength).map((i)=>arrays.map((arr)=>arr[i]));
}
