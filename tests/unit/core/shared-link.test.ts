import {describe, expect, it} from "vite-plus/test";
import {LEVELS} from "../../../src/core/levels.ts";
import {encodeLevel, levelFromCode, levelFromSearch} from "../../../src/core/share.ts";

const search = (level: unknown): string => `?CUBLITZ:${btoa(JSON.stringify(level))}`;
const VALID = {name: "Shared", map: ["S.X"], k: {}};

describe("levelFromSearch", () => {
	it("reads the level from the link in the feature request", () => {
		expect(
			levelFromSearch(
				"?CUBLITZ:eyJuYW1lIjoiRmxpcCBpdCBhbmQgcmV2ZXJzZSBpdCIsIm1hcCI6WyIuLnJveS4uLllPUlgiLCJTLnJveS4uLllPUlgiLCIuLnJveS4uLllPUlgiXSwiayI6e319",
			),
		).toStrictEqual({
			name: "Flip it and reverse it",
			map: ["..roy...YORX", "S.roy...YORX", "..roy...YORX"],
			k: {},
		});
	});

	it.each(["", "?", "?utm_source=mail", "?cublitz:e30=", "?CUBIST:e30="])(
		"ignores the unrelated query %j",
		(query) => {
			expect(levelFromSearch(query)).toBeNull();
		},
	);

	it.each<[string, (code: string) => string]>([
		["after the code", (code) => `?${code}&fbclid=IwAR0abc`],
		["before the code", (code) => `?utm_source=chat&${code}`],
		["on both sides of the code", (code) => `?a=1&${code}&b=2`],
		["after the code, holding a broken percent escape", (code) => `?${code}&note=%%%`],
	])("ignores parameters %s", (_name, link) => {
		const level = {name: "a>>>?", map: ["S.X"], k: {}};
		expect(levelFromSearch(link(encodeLevel(level)))).toStrictEqual(level);
	});

	it("still refuses a bad level when other parameters come with it", () => {
		expect(() => levelFromSearch(`${search({...VALID, par: 1})}&fbclid=IwAR0abc`)).toThrow(new Error("bad"));
		expect(() => levelFromSearch("?CUBLITZ:&fbclid=IwAR0abc")).toThrow("Unexpected end of JSON input");
	});

	it.each(["?fbclid=CUBLITZ:e30=", "?a=1&cublitz:e30=", "?a=1&b=2"])("finds no code in %j", (query) => {
		expect(levelFromSearch(query)).toBeNull();
	});

	it("keeps a + in the code, which query parsing would turn into a space", () => {
		const level = {name: "a>>>?", map: ["S.X"], k: {}};
		const code = encodeLevel(level);
		expect(code).toContain("+");
		expect(levelFromSearch(`?${code}`)).toStrictEqual(level);
	});

	it("reads a code whose padding a mail or chat app percent-encoded", () => {
		const code = encodeLevel({name: "Pad", map: ["S.X"], k: {}});
		expect(code.endsWith("=")).toBe(true);
		expect(levelFromSearch(`?${code.replaceAll("=", "%3D")}`)).toStrictEqual({name: "Pad", map: ["S.X"], k: {}});
	});

	it("accepts every piece the editor can place, with target needs", () => {
		const level = {
			name: "Everything",
			map: ["S.rogycbp", "ROGYCBPWZ", "1234 5..X"],
			k: {
				1: ["box", "w"],
				2: ["switch", "r"],
				3: ["button", "c"],
				4: ["door", "p"],
				5: ["wgate", "n"],
			},
			need: {t: "r", b: "p"},
		};
		expect(levelFromSearch(search(level))).toStrictEqual(level);
	});

	it("accepts the largest grid the editor can make", () => {
		const map = [`S${".".repeat(16)}X`, ...Array.from({length: 11}, () => ".".repeat(18))];
		expect(levelFromSearch(search({name: "Big", map, k: {}}))).toStrictEqual({name: "Big", map, k: {}});
	});

	it.each(LEVELS.map((level) => [level.name, level] as const))("accepts the campaign level %s", (_name, level) => {
		const shared = {name: level.name, map: level.map, k: level.k ?? {}, ...(level.need ? {need: level.need} : {})};
		expect(levelFromSearch(search(shared))).toStrictEqual(shared);
	});

	it.each<[string, string, string]>([
		["an empty code", "?CUBLITZ:", "Unexpected end of JSON input"],
		["a code that is not base64 or a percent escape", "?CUBLITZ:%%%", "URI malformed"],
		["a broken percent escape", "?CUBLITZ:%E0%A4%A", "URI malformed"],
		["base64 outside the alphabet", "?CUBLITZ:***", "Invalid character"],
		["base64 that is not JSON", `?CUBLITZ:${btoa("nope")}`, "is not valid JSON"],
		["a code cut short", search(VALID).slice(0, 20), "JSON"],
		["JSON that is not a level", `?CUBLITZ:${btoa("null")}`, "bad"],
	])("refuses %s", (_name, query, message) => {
		expect(() => levelFromSearch(query)).toThrow(message);
	});

	it.each<[string, unknown]>([
		["no name", {map: ["S.X"], k: {}}],
		["a name that is not a string", {...VALID, name: 5}],
		["a blank name", {...VALID, name: "  "}],
		["a name longer than a person would type", {...VALID, name: "x".repeat(101)}],
		["no map", {name: "n", k: {}}],
		["a map holding a non-string", {...VALID, map: ["S.X", 1]}],
		["too many rows", {...VALID, map: ["S.X", ...Array.from({length: 12}, () => "...")]}],
		["too many columns", {...VALID, map: [`S${".".repeat(17)}X`]}],
		["no start", {...VALID, map: ["..X"]}],
		["two starts", {...VALID, map: ["SSX"]}],
		["no target", {...VALID, map: ["S.."]}],
		["a map character with no meaning", {...VALID, map: ["S?X"]}],
		["markup in the map", {...VALID, map: ["S<X"]}],
		["a legend that is not an object", {...VALID, k: []}],
		["a legend key longer than one character", {...VALID, k: {ab: ["box", "r"]}}],
		["a legend key that hides a map character", {...VALID, k: {X: ["box", "r"]}}],
		["a legend entry that is not a pair", {...VALID, k: {1: ["box"]}}],
		["a legend entry of an unknown kind", {...VALID, k: {1: ["lava", "r"]}}],
		["markup as a legend color", {...VALID, k: {1: ["door", "<img src=x onerror=alert(1)>"]}}],
		["a color as a white gate's face", {...VALID, k: {1: ["wgate", "r"]}}],
		["inherited property names as a color", {...VALID, k: {1: ["door", "constructor"]}}],
		["needs that are not an object", {...VALID, need: "r"}],
		["a need on an unknown face", {...VALID, need: {q: "r"}}],
		["a need of an unknown color", {...VALID, need: {t: "white"}}],
		["a par from the link", {...VALID, par: 1}],
		["a tip from the link", {...VALID, tip: "hello"}],
		["a key the game does not know", {...VALID, cells: []}],
	])("refuses a level with %s", (_name, level) => {
		expect(() => levelFromSearch(search(level))).toThrow(new Error("bad"));
	});

	it("refuses a __proto__ key at the top level and in the legend", () => {
		const top = `{"name":"n","map":["S.X"],"k":{},"__proto__":{"x":1}}`;
		const legend = `{"name":"n","map":["S.X"],"k":{"__proto__":["box","r"]}}`;
		expect(() => levelFromSearch(`?CUBLITZ:${btoa(top)}`)).toThrow(new Error("bad"));
		expect(() => levelFromSearch(`?CUBLITZ:${btoa(legend)}`)).toThrow(new Error("bad"));
	});
});

describe("levelFromCode", () => {
	const level = {name: "a>>>?", map: ["S.X"], k: {}, need: {t: "r" as const}};
	const code = encodeLevel(level);

	it.each<[string, string]>([
		["a share code", code],
		["a share code with space around it", `\n  ${code}  \n`],
		["a share code with an older prefix", code.replace("CUBLITZ:", "CUBIST:")],
		["raw JSON", JSON.stringify(level)],
		["a full link", `https://cublitz.example/?${code}`],
		["a link with other parameters", `https://cublitz.example/?utm_source=chat&${code}&fbclid=IwAR0abc`],
		["a link with no scheme", `cublitz.example/?${code}`],
		["a link whose padding was percent-encoded", `https://cublitz.example/?${code.replaceAll("=", "%3D")}`],
	])("reads %s", (_name, text) => {
		expect(levelFromCode(text)).toStrictEqual(level);
	});

	it.each<[string, string, string]>([
		["an empty box", "", "JSON"],
		["text that is not a code", "not a code", "JSON"],
		["a link with no code", "https://cublitz.example/?utm_source=chat", "bad"],
		["a code cut short", code.slice(0, 20), "JSON"],
		["a level with no start", encodeLevel({name: "n", map: ["..X"], k: {}}), "bad"],
		["a level with no name", encodeLevel({map: ["S.X"], k: {}}), "bad"],
		["a level with a par", encodeLevel({name: "n", map: ["S.X"], k: {}, par: 1}), "bad"],
		["raw JSON of a bad level", JSON.stringify({name: "n", map: ["S.X"], k: {1: ["lava", "r"]}}), "bad"],
		["a link to a bad level", `https://cublitz.example/?${encodeLevel({name: "n", map: ["S.."], k: {}})}`, "bad"],
	])("refuses %s", (_name, text, message) => {
		expect(() => levelFromCode(text)).toThrow(message);
	});
});
