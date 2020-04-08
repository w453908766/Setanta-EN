import { Function } from "./function";
import { Something } from "./something";
import { Callable, callFunc, Value } from "./values";

export interface Object extends Callable {
    parent: Object | null;
    findFunction(s: string): Function | null;
}

export class ObjectImpl implements Object {
    public name: string;
    public parent: Object | null;
    protected functionMap: Map<string, Function>;
    protected constr: Function | null;
    constructor(name: string, g: Map<string, Function>, tuis?: Object) {
        this.name = name;
        this.functionMap = g;
        this.parent = tuis || null;
        this.constr = this.functionMap.get("nua") || null;
    }
    public arity(): number {
        return this.constr ? this.constr.arity() : 0;
    }
    public call(args: Value[]): Promise<Value> {
        const something = new Something(this.name, this);
        if (this.constr) {
            return callFunc(this.constr.bind(something), args).then(() => something);
        }
        return Promise.resolve(something);
    }
    public findFunction(s: string): Function | null {
        const g = this.functionMap.get(s);
        if (!g && this.parent) {
            return this.parent.findFunction(s);
        }
        return g || null;
    }
}
