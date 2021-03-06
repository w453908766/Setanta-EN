#!/usr/bin/env node
import * as readline from "readline";
import * as Asserts from "./asserts";
import { RuntimeError } from "./error";
import { SyntaxErr, PosInfo, ParseResult, ASTKinds, Parser } from "./gen_parser";
import { Interpreter, STOP } from "./i10r";
import { goLetters, Value } from "./values";

import * as fs from "fs";

const [, , ...pargs] = process.argv;

function printError(r: RuntimeError, source: string) {
    if(r.start && r.end && r.end.line - r.start.line <= 3) {
        const sourceLines = source.split('\n');
        console.error(`Exception: ${r.msg}`);
        for(let i = r.start.line; i <= r.end.line; i++)
            console.error(`Líne ${i}: ${sourceLines[i-1]}`);
    } else if(r.start && r.end) {
        console.error(`Suíomh [${r.start.line}:${r.start.offset} - ${r.end.line}:${r.end.offset}]: Exception: ${r.msg}`);
    } else if(r.start) {
        console.error(`Líne ${r.start.line}:${r.start.offset} Exception: ${r.msg}`);
    } else {
        console.error(`Exception: ${r.msg}`);
    }
}

function formatSyntaxErr(err: SyntaxErr): string {
    return `Exception at [${err.pos.line}: ${err.pos.offset}]: Expected: ${err.expmatches}`;
}

function getExternals(readfn: () => Promise<string|null>): [string[], Value][] {
    return [
        [
            ["put"], {
                name: "put",
                arity : () => -1,
                call : async (args: Value[]): Promise<string|null> => {
                    console.log(...args.map(goLetters));
                    return null;
                },
            },
        ],
        [
            ["enquire"], {
                name: "enquire",
                arity : () => 1,
                call : (args: Value[]): Promise<string|null> => {
                    process.stdout.write(Asserts.assertLetters(args[0]));
                    return readfn();
                },
            },
        ],
        [
            ["read_line"], {
                name: "read_line",
                arity : () => 0,
                call : (args: Value[]): Promise<Value> => {
                    return readfn();
                },
            },
        ],
    ];
}

async function getFullInput(getLine: () => Promise<string|null>,
    continuance: () => Promise<string|null>): Promise<string|SyntaxErr> {
    let prev = "";
    while(true) {
        const inpFn = prev === "" ? getLine : continuance;
        const inp = (await inpFn()) + '\n';
        if(inp === null)
            continue;
        const line = prev + inp;
        const parser = new Parser(line);
        const res = parser.parse();
        if(res.err === null)
            return line;
        if(res.err.pos.overallPos !== line.length)
            return res.err;
        prev = line;
    }
}

async function repl() {
    const rl: readline.Interface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const getLine = (): Promise<string|null> => {
        return new Promise((r) => {
            rl.question("setanta> ", (resp) => r(resp));
        });
    };
    const continuance = (): Promise<string|null> => {
        return new Promise((r) => rl.question("...", r));
    }
    const i = new Interpreter(getExternals(getLine));
    let soFar = "";
    let prevPos: PosInfo = {overallPos: 0, line: 1, offset: 0};
    while (true) {
        const input = await getFullInput(getLine, continuance);
        if(input instanceof SyntaxErr) {
            console.error(formatSyntaxErr(input));
            continue;
        }
        soFar += input;
        const parser = new Parser(soFar);
        parser.reset(prevPos);
        const res = parser.parse();

        // Ignore that mark is private, for now - TODO fix this in tsPEG
        // @ts-ignore
        prevPos = parser.mark();
        const ast = res.ast!;
        try {
            // This is an expression, we can print the result
            if (ast.stmts.length === 1 && ast.stmts[0].kind === ASTKinds.And) {
                    console.log(goLetters(await ast.stmts[0].evalfn(i.global)));
                    continue;
            }
            await i.interpret(ast);
        } catch (err) {
            if (err instanceof RuntimeError) {
                printError(err, soFar);
            } else if (err !== STOP) {
                console.error(err);
            }
        }
    }
    rl.close();
}

async function runFile() {
    const inFile = fs.readFileSync(pargs[0], { encoding: "utf8" });
    const parser = new Parser(inFile);
    const res = parser.parse();
    if (res.err) {
        console.error(formatSyntaxErr(res.err));
        process.exitCode = 1;
        return;
    }

    const rl: readline.Interface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal : false,
    });
    const it: AsyncIterableIterator<string> = rl[Symbol.asyncIterator]();
    const léigh = (): Promise<string|null> => {
        return it.next().then((next) => {
            if (next.done) {
                return null;
            }
            return next.value;
        });
    };
    const i = new Interpreter(getExternals(léigh));

    try {
        await i.interpret(res.ast!);
    } catch (err) {
        if (err instanceof RuntimeError) {
            printError(err, inFile);
            process.exitCode = 1;
        } else {
            throw err;
        }
    } finally {
        rl.close();
    }
}

function main(): Promise<void> {
    if (pargs.length > 0) {
        return runFile();
    }
    return repl();
}

main().catch((err) => {
    console.error(err);
});




