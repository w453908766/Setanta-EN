import { Value } from "./values";

export function cat(a: Value[], b: Value[]): Value[] {
    return a.concat(b);
}

export function repeat(ls: Value[], n: number): Value[] {
    const ret = [];
    for (let i = 0; i < n; ++i) {
        ret.push(...ls);
    }
    return ret;
}
