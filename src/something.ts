import { Object } from "./object";
import { RuntimeError } from "./error";
import { Callable, goLetters, Obj, Value } from "./values";

export class Something implements Obj {
    public name: string;
    public readonly tuis: TuisWrap | null = null;
    private object: Object;
    private members: Map<string, Value> = new Map();
    constructor(name: string, object: Object) {
        this.name = name;
        this.object = object;
        if (this.object.parent) {
            this.tuis = new TuisWrap(this, this.object.parent);
        }
    }
    public getAttr(s: string): Value {
        const ball = this.members.get(s);
        if (ball !== undefined) {
            return ball;
        }
        const func = this.object.findFunction(s);
        if (func) {
            return func.bind(this);
        }
        throw new RuntimeError(`There are no members of ${goLetters (this)} with name ${s}`);
    }
    public setAttr(id: string, v: Value) {
        this.members.set(id, v);
    }
}

class TuisWrap implements Obj {
    public readonly name: string = "tuis";
    private something: Something;
    private cr: Object;
    constructor(something: Something, cr: Object) {
        this.something = something;
        this.cr = cr;
    }
    public getAttr(s: string): Value {
        const func = this.cr.findFunction(s);
        if (func) {
            return func.bind(this.something);
        }
        throw new RuntimeError(`Parent of ${this.cr.name} has no members with name ${s}`);
    }
    public setAttr(id: string, v: Value) {
        throw new RuntimeError("You cannot change a parent");
    }
}
