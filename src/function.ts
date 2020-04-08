import { Environment } from "./env";
import { RuntimeError } from "./error";
import { Something } from "./something";
import { Callable, Stmt, Value } from "./values";

export interface Function extends Callable {
    bind(seo: Something): Function;
}

export class FunctionImpl implements Callable {
    public name: string;
    private defn: Stmt[];
    private args: string[];
    private env: Environment;
    private execFn: (body: Stmt[], env: Environment) => Promise<Value>;
    constructor(name: string, defn: Stmt[], args: string[], env: Environment,
                execFn: (body: Stmt[], env: Environment) => Promise<Value>) {
        this.name = name;
        this.defn = defn;
        this.args = args;
        this.env = env;
        this.execFn = execFn;
    }
    public bind(seo: Something): Function {
        const env = new Environment(this.env);
        env.define("seo", seo);
        if (seo.tuis) {
            env.define("tuis", seo.tuis);
        }
        return new FunctionImpl(this.name, this.defn, this.args, env, this.execFn);
    }
    public arity() {
        return this.args.length;
    }
    public call(args: Value[]): Promise<Value> {
        const env: Environment = new Environment(this.env);
        for (let i = 0; i < args.length; ++i) {
            env.define(this.args[i], args[i]);
        }
        return this.execFn(this.defn, env);
    }
}

export class FunctionWrap implements Function {
    public name: string;
    private readonly ar: number;
    private readonly f: (seo: Something, args: Value[]) => Promise<Value>;
    private seo: Something | null;
    constructor(name: string, arity: number, f: (seo: Something, args: Value[]) => Promise<Value>, seo?: Something) {
        this.name = name;
        this.ar = arity;
        this.f = f;
        this.seo = seo || null;
    }
    public arity() { return this.ar; }
    public call(args: Value[]): Promise<Value> {
        if (this.seo === null) {
            // Really really should not happen
            return Promise.reject(new RuntimeError("COMPLETE FAILURE"));
        }
        return this.f(this.seo, args);
    }
    public bind(seo: Something): Function {
        return new FunctionWrap(this.name, this.ar, this.f, seo);
    }
}
