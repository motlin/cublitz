import {describe, expect, it} from "vite-plus/test";
import {decodeLevel, encodeLevel} from "../../../src/core/share.ts";

const CODE = "CUBLITZ:eyJtYXAiOlsiUyJdfQ==";

describe("encodeLevel", () => {
	it("is the prefix and base64 of the level's JSON", () => {
		expect(encodeLevel({map: ["S"]})).toBe(CODE);
	});

	it("round-trips non-Latin names", () => {
		const level = {map: ["SX"], name: "Blå ★ 日本"};
		expect(decodeLevel(encodeLevel(level))).toStrictEqual(level);
	});
});

describe("decodeLevel", () => {
	it.each(["CUBLITZ:", "CUBITZ:", "CUBIST:"])("reads the %s prefix", (prefix) => {
		expect(decodeLevel(`${prefix}eyJtYXAiOlsiUyJdfQ==`)).toStrictEqual({map: ["S"]});
	});

	it("ignores whitespace around and inside a code", () => {
		expect(decodeLevel(`  CUBLITZ:eyJtYXAi\n Olsi UyJd\tfQ==  \n`)).toStrictEqual({map: ["S"]});
	});

	it("reads raw JSON", () => {
		expect(decodeLevel(' {"map":["SX"],"par":1} ')).toStrictEqual({map: ["SX"], par: 1});
	});

	it("keeps everything else in the level unchecked", () => {
		expect(decodeLevel('{"map":[],"k":5,"extra":true}')).toStrictEqual({
			map: [],
			k: 5,
			extra: true,
		});
	});

	it.each([
		["null", "null"],
		["a number", "5"],
		["no map", "{}"],
		["a map that is not an array", '{"map":"S"}'],
		["a map holding a non-string", '{"map":["S",1]}'],
	])("refuses %s with the same error", (_name, json) => {
		expect(() => decodeLevel(json)).toThrow(new Error("bad"));
	});

	it("fails on invalid JSON and invalid base64", () => {
		expect(() => decodeLevel("not json")).toThrow(SyntaxError);
		expect(() => decodeLevel("CUBLITZ:%%%")).toThrow();
	});
});
