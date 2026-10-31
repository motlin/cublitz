import {createContext, runInContext} from "node:vm";
import {describe, expect, it} from "vite-plus/test";
import {keepOriginalGlobalScope, topLevelNames} from "../../scripts/original-global-scope.ts";

const ORIGINAL = `
const LIMIT = 3, $ = 1;
let count = 0;
let unset;
function bump() { count++; return helper(); }
function helper() { return count; }
`;

// What the bundler writes: every top-level name is a var, with extra helpers the original did not have.
const BUNDLE = `
var extra = 10;
function privateHelper() { return extra; }
var LIMIT = 3;
var $ = privateHelper();
var count = 0, kept = 2;
var unset;
function bump() { count++; return helper(); }
function helper() { return count + kept; }
`;

const load = (script: string) => {
	const context = createContext({});
	runInContext("var window = this;", context);
	runInContext(script, context);
	return (code: string): unknown => runInContext(code, context);
};

describe("topLevelNames", () => {
	it("reads each declared name and its kind, in source order", () => {
		expect([...topLevelNames(ORIGINAL)]).toStrictEqual([
			["LIMIT", "const"],
			["$", "const"],
			["count", "let"],
			["unset", "let"],
			["bump", "function"],
			["helper", "function"],
		]);
	});
});

describe("keepOriginalGlobalScope", () => {
	const kept = keepOriginalGlobalScope(BUNDLE, topLevelNames(ORIGINAL));

	it("leaves exactly the original's names in global scope, each of the original's kind", () => {
		const read = load(kept);
		const json = (code: string): unknown => JSON.parse(read(`JSON.stringify(${code})`) as string);
		expect(
			json(
				`["extra", "privateHelper", "kept"].map((name) => { try { eval(name); return "visible"; } catch (e) { return e.name; } })`,
			),
		).toStrictEqual(["ReferenceError", "ReferenceError", "ReferenceError"]);
		expect(json(`Object.keys(window).filter((name) => name !== "window")`)).toStrictEqual(["bump", "helper"]);
		expect(read(`JSON.stringify(Object.getOwnPropertyDescriptor(window, "bump"))`)).toBe(
			'{"writable":true,"enumerable":true,"configurable":false}',
		);
		expect(json(`[LIMIT, $, count, String(unset), typeof window.LIMIT, typeof window.count]`)).toStrictEqual([
			3,
			10,
			0,
			"undefined",
			"undefined",
			"undefined",
		]);
		expect(read(`try { LIMIT = 4; } catch (e) { e.name }`)).toBe("TypeError");
	});

	it("keeps a let live, so outside code and the game read and write one binding", () => {
		const read = load(kept);
		expect(read("bump()")).toBe(3);
		expect(read("count")).toBe(1);
		expect(read("count = 5; bump()")).toBe(8);
	});

	it("looks a function up on window, as global function calls do", () => {
		expect(load(kept)(`window.helper = () => "replaced"; bump()`)).toBe("replaced");
	});

	it("throws what the script threw, with every const already readable", () => {
		const context = createContext({});
		runInContext("var window = this;", context);
		const failing = keepOriginalGlobalScope(`${BUNDLE}\nthrow new RangeError("boom");`, topLevelNames(ORIGINAL));
		expect(() => runInContext(failing, context)).toThrow("boom");
		expect(runInContext("JSON.stringify([LIMIT, count])", context)).toBe("[3,0]");
	});

	it("stays a sloppy script, where writing to a number is ignored rather than an error", () => {
		const sloppy = keepOriginalGlobalScope(
			`var LIMIT = 3; var n = 1; n.x = 2; var $ = 1; var count = n.x; var unset; function bump() {} function helper() {}`,
			topLevelNames(ORIGINAL),
		);
		expect(load(sloppy)("count")).toBe(undefined);
	});

	it("refuses a bundle missing one of the original's names or holding it as another kind", () => {
		const names = topLevelNames(ORIGINAL);
		expect(() => keepOriginalGlobalScope("var LIMIT = 3;", names)).toThrow(
			"The bundle's top level must hold: $ (const), count (let), unset (let), bump (function), helper (function)",
		);
		expect(() =>
			keepOriginalGlobalScope("var LIMIT, $, count, unset; var bump = 1; function helper() {}", names),
		).toThrow("The bundle's top level must hold: bump (function)");
		expect(() =>
			keepOriginalGlobalScope(
				"var LIMIT, count, unset; function $() {} function bump() {} function helper() {}",
				names,
			),
		).toThrow("The bundle's top level must hold: $ (const)");
	});
});
