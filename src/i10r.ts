import * as Asserts from "./asserts";
import { evalAsgnOp } from "./binops";
import { Builtins } from "./builtins";
import * as Checks from "./checks";
import { Object, ObjectImpl } from "./object";
import { Environment } from "./env";
import { RuntimeError, undefinedError } from "./error";
import * as P from "./gen_parser";
import { ASTKinds } from "./gen_parser";
import { Function, FunctionImpl } from "./function";
import { strcat, strrep, unescapeChars } from "./letters";
import { Callable, callFunc, Comparable,
    goLetters, idxList, Obj, Ref, TypeCheck, Value } from "./values";

type Stmt = P.AsgnStmt | P.NonAsgnStmt;

const BreakException = "BREAK";
const CCException = "CC";
export const STOP = "STOP";
const SKIP_COUNT_LIM = 5000;

class Return {
    public value: Value;
    constructor(v: Value) {
        this.value = v;
    }
}

export class Interpreter {
    public global: Environment = new Environment();
    private skipCnt: number = 0;
    private stopped: boolean = false;
    constructor(externals?: [string[], Value][]) {
        this.global = Environment.from(Builtins);
        if (externals) {
            for (const ext of externals) {
                for (const a of ext[0]) {
                    this.global.define(a, ext[1]);
                }
            }
        }
    }
    public stop() {
        this.stopped = true;
    }
    public interpret(p: P.Program): Promise<void> {
        return this.execStmts(p.stmts, this.global).catch((err) => {
            if (err === STOP) {
                return;
            }
            throw err;
        });
    }
    public execStmts(stmts: Stmt[], env: Environment): Promise<void> {
        const f = (x: Promise<void>, y: Stmt): Promise<void> => {
            return x.then(() => this.execStmt(y, env));
        };
        return stmts.reduce(f, Promise.resolve());
    }
    public execStmtBlock(blk: P.BlockStmt, env: Environment): Promise<void> {
        env = new Environment(env);
        return this.execStmts(blk.blk, env);
    }
    public execStmt(st: Stmt, env: Environment): Promise<void> {
        if (this.stopped) {
            return Promise.reject(STOP);
        }
        // Every SKIP_COUNT_LIM statements put the next execution on the macrotask queue.
        if (this.skipCnt >= SKIP_COUNT_LIM) {
            this.skipCnt = 0;
            return new Promise((resolve) => setTimeout(resolve)).then(() => this.execStmt(st, env));
        }
        ++this.skipCnt;
        switch (st.kind) {
            case ASTKinds.IfStmt:
                return this.execIf(st, env);
            case ASTKinds.BlockStmt:
                return this.execStmtBlock(st, env);
            case ASTKinds.AssignStmt:
                return this.execAssgn(st, env);
            case ASTKinds.DefnStmt:
                return this.execDefn(st, env);
            case ASTKinds.WhenStmt:
                return this.execWhen(st, env);
            case ASTKinds.ForStmt:
                return this.execForStmt(st, env);
            case ASTKinds.FunctionStmt:
                return this.execFunctionStmt(st, env);
            case ASTKinds.ReturnStmt:
                return this.execReturnStmt(st, env);
            case ASTKinds.ContinueStmt:
                return this.execContinueStmt(st);
            case ASTKinds.BreakStmt:
                return this.execBreakStmt(st);
            case ASTKinds.CtlchStmt:
                return Promise.resolve(this.execCtlchStmt(st, env));
            default:
                if (st.qeval !== null) {
                    st.qeval(env);
                    return Promise.resolve();
                }
                return st.evalfn(env).then();
        }
    }
    public refPostfix(p: P.Postfix, env: Environment): Promise<Ref> {
        if (p.ops.length > 0) {
            const ops: P.PostOp[] = p.ops.slice(0, p.ops.length - 1);
            const op: P.PostOp = p.ops[p.ops.length - 1];
            const subPost: P.Postfix = new P.Postfix(p.start, p.at, ops, p.end);
            return subPost.evalfn(env).then((val: Value) => {
                if ("args" in op) {
                    return Promise.reject(new RuntimeError("You cannot give a value to a function", p.start, p.end));
                }
                const arr: Value[] = Asserts.assertList(val);
                return op.expr.evalfn(env).then((idxV: Value) => {
                    const idx: number = Asserts.assertNumber(idxV);
                    return (v: Value) => {
                        if (idx < 0 || idx >= arr.length) {
                            throw new RuntimeError(`${idx} is beyond the list limit`,
                                p.start, p.end);
                        }
                        arr[idx] = v;
                    };
                });
            });
        }
        return this.refObjLookups(p.at, env);
    }
    public refObjLookups(o: P.ObjLookups, env: Environment): Promise<Ref> {
        if (o.attrs.length > 0) {
            const attrs: P.ObjLookups_$0[] = o.attrs.slice(1, o.attrs.length);
            const field: string = o.attrs[0].id.id;
            const subObj: P.ObjLookups = new P.ObjLookups(o.start, attrs, o.root, o.end);
            return subObj.evalfn(env).then((obj: Value) => {
                const val: Obj = Asserts.assertObj(obj);
                return (v: Value) => {
                    val.setAttr(field, v);
                };
            });
        }
        return this.refAtom(o.root, env);
    }
    public refAtom(a: P.Atom, env: Environment): Promise<Ref> {
        if (a.kind !== ASTKinds.ID) {
            return a.evalfn(env).then((v: Value) => {
                return Promise.reject(
                    new RuntimeError("You cannot give value to " +
                        goLetters(v)));
            });
        }
        return Promise.resolve((v: Value) => {
            env.assign(a.id, v);
        });
    }
    public execContinueStmt(b: P.ContinueStmt): Promise<void> {
        return Promise.reject(CCException);
    }
    public execBreakStmt(b: P.BreakStmt): Promise<void> {
        return Promise.reject(BreakException);
    }
    public execCtlchStmt(b: P.CtlchStmt, env: Environment) {
        const wrapEnv = new Environment(env);
        const functions = new Map<string, Function>();
        for (const func of b.functions) {
            const g = this.makeFunction(func, env);
            functions.set(g.name, g);
        }
        if (b.tuis) {
            const tuis = env.get(b.tuis.id.id);
            if (!tuis || !(Checks.isObject(tuis))) {
                throw new RuntimeError(`There is no object with the name ${b.tuis.id.id}`,
                    b.tuis.parentstart, b.tuis.parentend);
            }
            const ctlch = new ObjectImpl(b.id.id, functions, tuis);
            env.define(b.id.id, ctlch);
        } else {
            const ctlch = new ObjectImpl(b.id.id, functions);
            env.define(b.id.id, ctlch);
        }
    }
    public execReturnStmt(b: P.ReturnStmt, env: Environment): Promise<void> {
        if (b.exp) {
            if (b.exp.qeval !== null) { // Check if quick
                return Promise.reject(new Return(b.exp.qeval(env)));
            }
            return b.exp.evalfn(env).then((v: Value) => Promise.reject(new Return(v)));
        }
        return Promise.reject(new Return(null));
    }
    public execFunctionStmt(fn: P.FunctionStmt, env: Environment): Promise<void> {
        return new Promise((r) => {
            const func = this.makeFunction(fn, env);
            env.define(fn.id.id, func);
            r();
        });
    }
    public async execWhen(n: P.WhenStmt, env: Environment): Promise<void> {
        while (true) {
            const x = await n.expr.evalfn(env);
            if (!Checks.isTrue(x)) {
                break;
            }
            try {
                await this.execStmt(n.stmt, env);
            } catch (err) {
                if (err === BreakException) {
                    break;
                }
                if (err === CCException) {
                    continue;
                }
                throw err;
            }
        }
    }
    public async execForStmt(n: P.ForStmt, env: Environment): Promise<void> {
        env = new Environment(env);
        const s = Asserts.assertNumber(await n.strt.evalfn(env));
        const e = Asserts.assertNumber(await n.end.evalfn(env));
        let stp = e >= s ? 1 : -1;
        if (n.step !== null) {
            stp = Asserts.assertNumber(await n.step.step.evalfn(env));
        }
        const dircheck = e >= s ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
        for (let i = s; dircheck(i, e); i += stp) {
            env.define(n.id.id, i);
            try {
                await this.execStmt(n.stmt, env);
            } catch (err) {
                if (err === BreakException) {
                    break;
                }
                if (err === CCException) {
                    continue;
                }
                throw err;
            }
        }
    }
    public execIf(f: P.IfStmt, env: Environment): Promise<void> {
        return f.expr.evalfn(env).then((v) => {
            if (Checks.isTrue(v)) {
                return this.execStmt(f.stmt, env);
            }
            if (!f.elsebranch) {
                return;
            }
            return this.execStmt(f.elsebranch.stmt, env);
        });
    }
    public execDefn(a: P.DefnStmt, env: Environment): Promise<void> {
        if (env.has(a.id.id)) {
            return Promise.reject(
                new RuntimeError(`This scope already contains ${a.id.id}`,
                a.idstart, a.idend));
        }
        // Try use quick strategy
        if (a.expr.qeval !== null) {
            const val = a.expr.qeval(env);
            env.define(a.id.id, val);
            return Promise.resolve();
        }
        return a.expr.evalfn(env).then((val) => {
            return env.define(a.id.id, val);
        });
    }
    public execAssgn(t: P.AssignStmt, env: Environment): Promise<void> {
        // Direct assignment is taken care of separately due to no current value
        if (t.op === "=") {
            // Try quick evaluation of expression
            if (t.expr.qeval !== null) {
                const val = t.expr.qeval(env);
                return this.refPostfix(t.lhs, env).then((ref: Ref) => ref(val));
            }
            return t.expr.evalfn(env).then((val: Value) => {
                return this.refPostfix(t.lhs, env).then((ref: Ref) => ref(val));
            });
        }
        // If both lhs and rhs are quick
        if (t.expr.qeval !== null && t.lhs.qeval !== null) {
            const dv = t.expr.qeval(env);
            const cur = t.lhs.qeval(env);
            return this.refPostfix(t.lhs, env).then((ref: Ref) =>
                evalAsgnOp(ref, cur, dv, t.op));

        }
        // If only rhs is quick
        if (t.expr.qeval !== null) {
            const dv = t.expr.qeval(env);
            return this.refPostfix(t.lhs, env).then((ref: Ref) =>
                t.lhs.evalfn(env).then((cur: Value) => evalAsgnOp(ref, cur, dv, t.op)));
        }
        // If only lhs is quick
        if (t.lhs.qeval !== null) {
            const cur = t.lhs.qeval(env);
            return t.expr.evalfn(env).then((dv: Value) =>
                this.refPostfix(t.lhs, env).then((ref: Ref) =>
                    evalAsgnOp(ref, cur, dv, t.op)));
        }
        // Neither are quick
        return t.expr.evalfn(env).then((dv: Value) =>
            this.refPostfix(t.lhs, env).then((ref: Ref) =>
                t.lhs.evalfn(env).then((cur: Value) => evalAsgnOp(ref, cur, dv, t.op))));
    }
    public evalCSIDs(ids: P.CSIDs): string[] {
        return [ids.head.id].concat(ids.tail.map((x) => x.id.id));
    }
    private makeFunction(fn: P.FunctionStmt, env: Environment): Function {
        const execFn = (body: Stmt[], innerEnv: Environment): Promise<Value> => {
            return this.execStmts(body, innerEnv).then((e) => null).catch((e) => {
                if (e instanceof Return) {
                    return e.value;
                }
                if (e !== BreakException) {
                    throw e;
                }
                return null;
            });
        };
        const args = fn.args ? this.evalCSIDs(fn.args) : [];
        return new FunctionImpl(fn.id.id, fn.stmts, args, env, execFn);
    }
}
