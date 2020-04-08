import * as Asserts from "./asserts";
import * as Checks from "./checks";
import { ObjectImpl } from "./object";
import { RuntimeError } from "./error";
import { FunctionWrap } from "./function";
import { replace } from "./letters";
import { Something } from "./something";
import { callFunc, goLetters, ObjWrap, Value } from "./values";

export const Builtins: [string, Value][] = [
    [
        // returns length of list / letters
        "length", {
            name: "length",
            arity : () => 1,
            call : async (args: Value[]): Promise<Value> => {
                return Asserts.assertIndexable(args[0]).length;
            },
        },
    ],
    [
        // mapList takes a function f and returns the map of f over the list
        "mapList", {
            name: "mapList",
            arity : () => 2,
            call : async (args: Value[]): Promise<Value> => {
                const f = Asserts.assertCallable(args[0]);
                const ls = Asserts.assertList(args[1]);
                return Promise.all(ls.map((x) => callFunc(f, [x])));
            },
        },
    ],
    [
        // args[0]: (list | letters); args[1]: number; args[2]: number
        // Slice returns a sublist of args[0] from args[1] to args[2]
        "slice", {
            name: "slice",
            arity : () => 3,
            call : async (args: Value[]): Promise<Value> => {
                const l = Asserts.assertNumber(args[1]);
                const r = Asserts.assertNumber(args[2]);
                if (Checks.isList(args[0])) {
                    const ls = Asserts.assertList(args[0]);
                    return ls.slice(l, r);
                } else if (Checks.isLetters(args[0])) {
                    const s = Asserts.assertLetters(args[0]);
                    return s.substr(l, r);
                }
                throw new RuntimeError(`${goLetters(args[0])} is not a list or letters`);
            },
        },
    ],
    [
        // args[0]: letters, args[1]: letters
        // split calls split on args[0] with args[1] as divider
        "split", {
            name: "split",
            arity : () => 2,
            call : async (args: Value[]): Promise<Value> => {
                const a = Asserts.assertLetters(args[0]);
                const b = Asserts.assertLetters(args[1]);
                return a.split(b);
            },
        },
    ],
    [
        // args[0]: letters, args[1]: letters, args[2]: letters
        // replace all occurrences of args[1] in args[0] with args[2]
        "replace", {
            name: "replace",
            arity : () => 3,
            call : async (args: Value[]): Promise<Value> => {
                const a = Asserts.assertLetters(args[0]);
                const b = Asserts.assertLetters(args[1]);
                const c = Asserts.assertLetters(args[2]);
                return replace(a, b, c);
            },
        },
    ],
    [
        // args[0]: (letters | bool | number)
        // toNumber casts args[0] to a number
        "toNumber", {
            name : "toNumber",
            arity : () => 1,
            call : (args: Value[]): Promise<number> => {
                if (Checks.isLetters(args[0]) || Checks.isBool(args[0]) || Checks.isNumber(args[0])) {
                    return Promise.resolve(Number(args[0]));
                }
                throw new RuntimeError(`${goLetters(args[0])} is not a number, letters or bool`);
            },
        },
    ],
    [
        // args[0-1]: number
        // min returns min of args[0], args[1]
        "min", {
            name : "min",
            arity : () => 2,
            call : (args: Value[]): Promise<number> => {
                const a = Asserts.assertNumber(args[0]);
                const b = Asserts.assertNumber(args[1]);
                return Promise.resolve(Math.min(a, b));
            },
        },
    ],
    [
        // args[0-1]: number
        // max returns max of args[0], args[1]
        "max", {
            name : "max",
            arity : () => 2,
            call : (args: Value[]): Promise<number> => {
                const a = Asserts.assertNumber(args[0]);
                const b = Asserts.assertNumber(args[1]);
                return Promise.resolve(Math.max(a, b));
            },
        },
    ],
    [
        // Built in maths object
        "maths", new ObjWrap("maths", [
            // constants
            [["pi"], Math.PI],
            [["e"], Math.E],
            [
                // Square function
                ["square"], {
                    name : "square",
                    arity: () => 1,
                    call: (args: Value[]): Promise<number> => {
                        const x = Asserts.assertNumber(args[0]);
                        return Promise.resolve(x * x);
                    },
                },
            ],
            [
                // Sqrt function
                ["sqrt"], {
                    name : "sqrt",
                    arity: () => 1,
                    call: (args: Value[]): Promise<number> => {
                        const x = Asserts.assertNumber(args[0]);
                        return Promise.resolve(Math.sqrt(x));
                    },
                },
            ],
            [
                // cos function
                ["cos"], {
                    name : "cos",
                    arity: () => 1,
                    call: (args: Value[]): Promise<number> => {
                        const x = Asserts.assertNumber(args[0]);
                        return Promise.resolve(Math.cos(x));
                    },
                },
            ],
            [
                // cos function
                ["sin"], {
                    name : "sin",
                    arity: () => 1,
                    call: (args: Value[]): Promise<number> => {
                        const x = Asserts.assertNumber(args[0]);
                        return Promise.resolve(Math.sin(x));
                    },
                },
            ],
            [
                // log function
                ["log"], {
                    name : "log",
                    arity: () => 1,
                    call: (args: Value[]): Promise<number> => {
                        const x = Asserts.assertNumber(args[0]);
                        if (x <= 0) {
                            return Promise.reject(new RuntimeError(`log(0) is not defined`));
                        }
                        return Promise.resolve(Math.log(x));
                    },
                },
            ],
            [
                // logB function
                ["logb"], {
                    name : "logb",
                    arity: () => 2,
                    call: (args: Value[]): Promise<number> => {
                        const x = Asserts.assertNumber(args[0]);
                        const b = Asserts.assertNumber(args[1]);
                        if (x <= 0) {
                            return Promise.reject(new RuntimeError(`log(${x}) is not defined`));
                        }
                        if (b <= 0 || b === 1) {
                            return Promise.reject(new RuntimeError(`log(${x}) is not defined when ${b}<=0 or ${b}==1`));
                        }
                        return Promise.resolve(Math.log(x) / Math.log(b));
                    },
                },
            ],
            [
                // Random floating point number between 0 and 1
                ["rand"], {
                    name: "rand",
                    arity: () => 0,
                    call: (args: Value[]): Promise<number> => Promise.resolve(Math.random()),
                },
            ],
            [
                // arity: 2; args[0]: number, args[1]: number;
                // Returns random integer in the range [args[0], args[1])
                ["random"], {
                    name: "random",
                    arity: () => 2,
                    call: (args: Value[]): Promise<number> => {
                        const l = Asserts.assertNumber(args[0]);
                        const r = Asserts.assertNumber(args[1]);
                        return Promise.resolve(Math.floor(Math.random() * (r - l) + l));
                    },
                },
            ],
        ]),
    ],
];
