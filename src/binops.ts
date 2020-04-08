import * as Asserts from "./asserts";
import * as Checks from "./checks";
import { Environment } from "./env";
import { RuntimeError, tagErrorLoc } from "./error";
import { EvalFn } from "./evals";
import { PosInfo, And, Or } from "./gen_parser";
import { cat, repeat } from "./list";
import { strcat, strrep } from "./letters";
import { IsQuick, isQuick, MaybeEv as MaybeQuickEv } from "./quickevals";
import { Comparable, goLetters, Ref, TypeCheck, Value } from "./values";

interface IEvalable {evalfn: EvalFn; qeval: MaybeQuickEv; }

type BinOp = (a: Value, b: Value) => Value;

interface BinOpEntry { lcheck: TypeCheck; rcheck: TypeCheck; op: BinOp; }

export function orBinOp(or: Or): EvalFn {
    if (or.tail.length === 0) {
        return or.head.evalfn.bind(or.head);
    }
    return (env: Environment) =>
        or.tail.reduce((x: Promise<Value>, y): Promise<Value> =>
            x.then((val) => {
                if (Checks.isTrue(val)) {
                    return val;
                }
                return y.trm.evalfn(env);
            })
            , or.head.evalfn(env))
                .catch(err => Promise.reject(tagErrorLoc(err, or.start, or.end)));
}

export function andBinOp(and: And): EvalFn {
    if (and.tail.length === 0) {
        return and.head.evalfn.bind(and.head);
    }
    return (env: Environment) =>
        and.tail.reduce((x: Promise<Value>, y): Promise<Value> =>
            x.then((val) => {
                if (!Checks.isTrue(val)) {
                    return val;
                }
                return y.trm.evalfn(env);
            })
            , and.head.evalfn(env))
                .catch(err => Promise.reject(tagErrorLoc(err, and.start, and.end)));
}

export function binOpEvalFn(obj: {head: IEvalable, tail: {trm: IEvalable, op: string}[], start: PosInfo, end: PosInfo}): EvalFn {
    if (obj.tail.length === 0) {
        return obj.head.evalfn.bind(obj.head);
    }
    return (env: Environment) =>
        obj.tail.reduce((x: Promise<Value>, y): Promise<Value> =>
            x.then((a: Value) =>
                y.trm.evalfn(env).then((b: Value) =>
                    evalBinOp(a, b, y.op, obj.start, obj.end))),
            obj.head.evalfn(env));
}

export function orQuickBinOp(or: Or): MaybeQuickEv {
    if (or.tail.length === 0) {
        const childF = or.head.qeval;
        return childF === null ? null : childF.bind(or.head);
    }
    const head = or.head;
    if (!isQuick(head)) {
        return null;
    }
    const tail: IsQuick[] = [];
    for (const op of or.tail) {
        const trm = op.trm;
        if (!isQuick(trm)) {
            return null;
        }
        tail.push(trm);
    }
    return (env: Environment) => {
        let acc = head.qeval(env);
        for (const op of tail) {
            if (Checks.isTrue(acc)) {
                return acc;
            }
            acc = op.qeval(env);
        }
        return acc;
    };
}

export function andQuickBinOp(and: And): MaybeQuickEv {
    if (and.tail.length === 0) {
        const childF = and.head.qeval;
        return childF === null ? null : childF.bind(and.head);
    }
    const head = and.head;
    if (!isQuick(head)) {
        return null;
    }
    const tail: IsQuick[] = [];
    for (const op of and.tail) {
        const trm = op.trm;
        if (!isQuick(trm)) {
            return null;
        }
        tail.push(trm);
    }
    return (env: Environment) => {
        let acc = head.qeval(env);
        for (const op of tail) {
            if (!Checks.isTrue(acc)) {
                return acc;
            }
            acc = op.qeval(env);
        }
        return acc;
    };
}

export function binOpQuickEvalFn(obj: {head: IEvalable, tail: {trm: IEvalable, op: string}[], start: PosInfo, end: PosInfo}): MaybeQuickEv {
    if (obj.tail.length === 0) {
        const childF = obj.head.qeval;
        return childF === null ? null : childF.bind(obj.head);
    }
    // Check if all operands are quick
    const head = obj.head;
    if (!isQuick(head)) {
        return null;
    }
    interface QuickOp {
        trm: IsQuick;
        op: string;
    }
    const ops: QuickOp[] = [];
    for (const op of obj.tail) {
        if (!isQuick(op.trm)) {
            return null;
        }
        ops.push(op as QuickOp); // Safe as checked non-null in isQuick check
    }
    return (env: Environment) => {
        return ops.reduce((x: Value, y): Value => {
            const b = y.trm.qeval(env);
            return evalBinOp(x, b, y.op, obj.start, obj.end);
        }, head.qeval(env));
    };
}

function makeBinOp<L extends Value, R extends Value>(lassert: (v: Value) => L,
                                                     rassert: (v: Value) => R, op: (a: L, b: R) => Value): BinOp {
    return (a: Value, b: Value) =>  {
        return op(lassert(a), rassert(b));
    };
}

function numBinOpEntry(f: (a: number, b: number) => Value): BinOpEntry {
    return {
        lcheck : Checks.isNumber,
        op : makeBinOp(Asserts.assertNumber, Asserts.assertNumber, f),
        rcheck: Checks.isNumber,
    };
}

function compBinOpEntry(f: (a: Comparable, b: Comparable) => Value): BinOpEntry {
    return {
        lcheck : Checks.isComparable,
        op : makeBinOp(Asserts.assertComparable, Asserts.assertComparable, f),
        rcheck: Checks.isComparable,
    };
}

const binOpTable: Map<string, BinOpEntry[]> = new Map([
    ["+", [
        numBinOpEntry((a, b) => a + b),
        {
            lcheck : Checks.isList,
            op : makeBinOp(Asserts.assertList, Asserts.assertList, cat),
            rcheck : Checks.isList,
        },
        {
            lcheck : Checks.isLetters,
            op : makeBinOp(Asserts.assertLetters, Asserts.assertLetters, strcat),
            rcheck : Checks.isLetters,
        },
    ]],
    ["-", [numBinOpEntry((a, b) => a - b)]],
    ["*", [
        numBinOpEntry((a, b) => a * b),
        {
            lcheck : Checks.isList,
            op : makeBinOp(Asserts.assertList, Asserts.assertNumber, repeat),
            rcheck : Checks.isNumber,
        },
        {
            lcheck : Checks.isLetters,
            op : makeBinOp(Asserts.assertLetters, Asserts.assertNumber, strrep),
            rcheck : Checks.isNumber,
        },
    ]],
    ["%", [numBinOpEntry((a, b) => {
        let val = a % b;
        if (val < 0) {
            val += b;
        }
        return val;
    })]],
    ["/", [numBinOpEntry((a, b) => {
        if (b === 0) {
            throw new RuntimeError(`Divide by 0`);
        }
        return a / b;
    })]],
    ["//", [numBinOpEntry((a, b) => {
        if (b === 0) {
            throw new RuntimeError(`Divide by 0`);
        }
        return Math.floor(a / b);
    })]],
    ["<", [compBinOpEntry((a, b) => a < b)]],
    [">", [compBinOpEntry((a, b) => a > b)]],
    ["<=", [compBinOpEntry((a, b) => a <= b)]],
    [">=", [compBinOpEntry((a, b) => a >= b)]],
    ["==", [{
        lcheck : (x: Value): boolean => true, // All values pass this check.
        op : makeBinOp((x: Value): Value => x,
            (x: Value): Value => x,
            (a: Value, b: Value): boolean => Checks.isEqual(a, b)),
        rcheck : (x: Value): boolean => true, // All values pass this check.
    }]],
    ["!=", [{
        lcheck : (x: Value): boolean => true, // All values pass this check.
        op : makeBinOp((x: Value): Value => x, // All values get asserted fine.
            (x: Value): Value => x,
            (a: Value, b: Value): boolean => !Checks.isEqual(a, b)),
        rcheck : (x: Value): boolean => true, // All values pass this check.
    }]],
]);

function evalBinOp(a: Value, b: Value, op: string, start: PosInfo, end: PosInfo): Value {
    const g = binOpTable.get(op);
    if (g) {
        for (const x of g) {
            if (x.lcheck(a) && x.rcheck(b)) {
                return x.op(a, b);
            }
        }
    }
    throw new RuntimeError(`You cannot use $ {goLetters (op)} with $ {goLetters (a)} and $ {goLetters (b)}`, start, end);
}

type AsgnOp = (ref: Ref, cur: Value, dv: Value) => void;

interface AsgnOpEntry { lcheck: TypeCheck; rcheck: TypeCheck; op: AsgnOp; }

function makeAsgnOp<L extends Value, R extends Value>(lassert: (v: Value) => L,
                                                      rassert: (v: Value) => R, op: (a: L, b: R) => Value): AsgnOp {
    return (ref: Ref, a: Value, b: Value) =>  {
        return ref(op(lassert(a), rassert(b)));
    };
}

function numAsgnOpEntry(f: (a: number, b: number) => Value): AsgnOpEntry {
    return {
        lcheck : Checks.isNumber,
        op : makeAsgnOp(Asserts.assertNumber, Asserts.assertNumber, f),
        rcheck: Checks.isNumber,
    };
}

const asgnOpTable: Map<string, AsgnOpEntry[]> = new Map([
    ["+=", [
        numAsgnOpEntry((a, b) => a + b),
        {
            // Using += on a list is more efficient than x = x + y, due to use of in place `push`
            lcheck: Checks.isList,
            op: (ref: Ref, cur: Value, d: Value) => {
                const cv = Asserts.assertList(cur);
                const dv = Asserts.assertList(d);
                cv.push(...dv);
            },
            rcheck: Checks.isList,
        },
        {
            lcheck: Checks.isLetters,
            op: makeAsgnOp(Asserts.assertLetters, Asserts.assertLetters, strcat),
            rcheck: Checks.isLetters,
        },
    ]],
    ["-=", [numAsgnOpEntry((a, b) => a - b)]],
    ["/=", [numAsgnOpEntry((a, b) => a / b)]],
    ["%=", [numAsgnOpEntry((a, b) => {
        let val = a % b;
        if (val < 0) {
            val += b;
        }
        return val;
    })]],
    ["*=", [
        numAsgnOpEntry((a, b) => a * b),
        {
            lcheck: Checks.isList,
            op: makeAsgnOp(Asserts.assertList, Asserts.assertNumber, repeat),
            rcheck: Checks.isNumber,
        },
        {
            lcheck: Checks.isLetters,
            op: makeAsgnOp(Asserts.assertLetters, Asserts.assertNumber, strrep),
            rcheck: Checks.isNumber,
        },
    ]],
]);

export function evalAsgnOp(ref: Ref, cur: Value, dv: Value, op: string) {
    const g = asgnOpTable.get(op);
    if (g) {
        for (const x of g) {
            if (x.lcheck(cur) && x.rcheck(dv)) {
                return x.op(ref, cur, dv);
            }
        }
    }
    throw new RuntimeError(`You cannot use $ {goLetters (op)} with $ {goLetters (cur)} and $ {goLetters (dv)}`);
}
