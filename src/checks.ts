import { Object } from "./object";
import { Callable, Comparable, Obj, Value } from "./values";

export function isTrue(v: Value) {
    return v !== 0 && v !== false && v !== null;
}

export function isEqual(a: Value, b: Value): boolean {
    if (isList(a) && isList(b) && a.length === b.length) {
        return a.map((x, i) => [x, b[i]]).every((x) => isEqual(x[0], x[1]));
    }
    return a === b;
}

export function isCallable(v: Value): v is Callable {
    return !(v === null || isNumber(v) || isBool(v) || isLetters(v) || isList(v)) && "call" in v;
}

export function isObj(v: Value): v is Obj {
    return !(v === null || isNumber(v) || isBool(v) || isLetters(v) || isList(v)) && "getAttr" in v;
}

export function isNumber(v: Value): v is number {
    return typeof v === "number";
}

export function isBool(v: Value): v is boolean {
    return typeof v === "boolean";
}

export function isLetters(v: Value): v is string {
    return typeof v === "string";
}

export function isComparable(v: Value): v is Comparable {
    return isBool(v) || isNumber(v) || isLetters(v);
}

export function isList(v: Value): v is Value[] {
    return Array.isArray(v);
}

export function isObject(v: Value): v is Object {
    return v !== null && !(isBool(v) || isNumber(v) || isLetters(v) || isList(v)) && "findFunction" in v;
}
