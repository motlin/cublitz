import {describe, expect, it} from "vite-plus/test";
import {CNAME, dirWord, FNAME, howWork, list, wgateName} from "../../../src/core/names.ts";

describe("names", () => {
	it("names every color and face", () => {
		expect({CNAME, FNAME}).toStrictEqual({
			CNAME: {
				r: "red",
				o: "orange",
				y: "yellow",
				g: "green",
				c: "cyan",
				b: "blue",
				p: "purple",
				w: "white",
			},
			FNAME: {t: "top", b: "bottom", n: "north", s: "south", e: "east", w: "west"},
		});
	});

	it("says how to work a color", () => {
		expect([howWork("w"), howWork("r")]).toStrictEqual(["completely bare", "solid red"]);
	});

	it("names white gates, leaving the bottom face unsaid", () => {
		expect([wgateName("b"), wgateName("t"), wgateName("n")]).toStrictEqual([
			"white gate",
			"top white gate",
			"north white gate",
		]);
	});

	it("names every direction", () => {
		expect((["N", "S", "E", "W"] as const).map(dirWord)).toStrictEqual(["north", "south", "east", "west"]);
	});

	it("joins lists of any length", () => {
		expect([list([]), list(["a"]), list(["a", "b"]), list(["a", "b", "c"])]).toStrictEqual([
			"",
			"a",
			"a and b",
			"a, b and c",
		]);
	});
});
