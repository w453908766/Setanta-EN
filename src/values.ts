import * as Asserts from "./asserts";
import * as Checks from "./checks";
import { Environment } from "./env";
import { RuntimeError } from "./error";
import { AsgnStmt, ID, NonAsgnStmt } from "./gen_parser";
import { Interpreter } from "./i10r";

export type Value = number | boolean | Callable | null | ValLs | string | Obj;
interface ValLs extends Array<Value> {}

export type TypeCheck = (v: Value) => boolean;

export type Stmt = AsgnStmt | NonAsgnStmt;

export type Comparable = number | boolean;

export type Ref = (v: Value) => void;

export interface Callable {
    name: string;
    arity: () => number;
    call: (args: Value[]) => Promise<Value>;
}

export interface Obj {
    name: string;
    getAttr: (id: string) => Value;
    setAttr: (id: string, v: Value) => void;
}

export function callFunc(x: Value, args: Value[]): Promise<Value> {
    x = Asserts.assertCallable(x);
    const ar = x.arity();
    if (ar !== -1 && args.length !== x.arity()) {
        throw new RuntimeError(`${ar} needs an argument at ${goLetters(x)}, but found ${args.length}`);
    }
    return x.call(args);
}

export function idxList(x: Value, idx: Promise<Value>): Promise<Value> {
    const ls = Asserts.assertIndexable(x);
    return idx.then((v) => {
        v = Asserts.assertNumber(v);
        if (v < 0 || v >= ls.length) {
            throw new RuntimeError(`${goLetters(v)} is over the list limit`);
        }
        return ls[v];
    });
}

// Quick index list, for use with quick evaluation strategies
export function qIdxList(x: Value, idx: Value): Value {
    const ls = Asserts.assertIndexable(x);
    const v = Asserts.assertNumber(idx);
    if (v < 0 || v >= ls.length) {
        throw new RuntimeError(`${goLetters (v)} is over the list limit`);
    }
    return ls[v];
}

export class ObjWrap implements Obj {
    public name: string;
    public attrs: Map<string, Value>;
    constructor(name: string, attrs: [string[], Value][]) {
        this.name = name;
        this.attrs = new Map();
        for (const attr of attrs) {
            for (const k of attr[0]) {
                this.attrs.set(k, attr[1]);
            }
        }
    }
    public getAttr(id: string): Value {
        return this.attrs.get(id) || null;
    }
    public setAttr(id: string, v: Value) {
        throw new RuntimeError(`You cannot change ${goLetters(this)}`);
    }
}

export function goLetters(v: Value): string {
    if (Checks.isLetters(v)) {
        return v;
    }
    if (Checks.isNumber(v)) {
        return v.toString();
    }
    if (Checks.isBool(v)) {
        return v ? "true" : "false";
    }
    if (v === null) {
        return "void";
    }
    if (Checks.isList(v)) {
        return `[${v.map(goLetters).join(", ")}]`;
    }
    if (Checks.isCallable(v)) {
        return `< function ${v.name} >`;
    }
    return `< something ${v.name} >`;
}
