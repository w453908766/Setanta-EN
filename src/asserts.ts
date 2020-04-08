import * as Checks from "./checks";
import { RuntimeError } from "./error";
import { Callable, Comparable, goLetters, Obj, Value } from "./values";

export function assertNumber(x: Value): number {
    if (Checks.isNumber(x)) {
        return x;
    }
    throw new RuntimeError(`${goLetters(x)} is not a number`);
}

export function assertBool(x: Value): boolean {
    if (Checks.isBool(x)) {
        return x;
    }
    throw new RuntimeError(`${goLetters(x)} is not a bool`);
}

export function assertList(x: Value): Value[] {
    if (Checks.isList(x)) {
        return x;
    }
    throw new RuntimeError(`${goLetters(x)} is not a list`);
}

export function assertLetters(x: Value): string {
    if (Checks.isLetters(x)) {
        return x;
    }
    throw new RuntimeError(`${goLetters(x)} is not a letters`);
}

export function assertCallable(x: Value): Callable {
    if (Checks.isCallable(x)) {
        return x;
    }
    throw new RuntimeError(`${goLetters(x)} is not a function`);
}

export function assertObj(x: Value): Obj {
    if (Checks.isObj(x)) {
        return x;
    }
    throw new RuntimeError(`${goLetters(x)} is not a something`);
}

export function assertComparable(a: Value): Comparable {
    if (Checks.isComparable(a)) {
        return a;
    }
    throw new RuntimeError(`cannot compare ${goLetters(a)}`);
}

export function assertIndexable(a: Value): ArrayLike<Value> {
    if (Checks.isList(a) || Checks.isLetters(a)) {
        return a;
    }
    throw new RuntimeError(`${goLetters(a)} is not a list or letters`);
}
