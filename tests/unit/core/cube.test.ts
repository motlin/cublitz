import {describe, expect, it} from "vite-plus/test";
import {blank, DIRS, FACES, roll, solidColor, workColor} from "../../../src/core/cube.ts";
import type {Faces} from "../../../src/core/types.ts";

const labelled: Faces = {t: "r", b: "o", n: "y", s: "g", e: "c", w: "b"};
const solid = (c: "r"): Faces => ({t: c, b: c, n: c, s: c, e: c, w: c});

describe("roll", () => {
	it("tips the cube east", () => {
		expect(roll(labelled, "E")).toStrictEqual({t: "b", e: "r", b: "c", w: "o", n: "y", s: "g"});
	});

	it("tips the cube west", () => {
		expect(roll(labelled, "W")).toStrictEqual({t: "c", w: "r", b: "b", e: "o", n: "y", s: "g"});
	});

	it("tips the cube north", () => {
		expect(roll(labelled, "N")).toStrictEqual({n: "r", b: "y", s: "o", t: "g", e: "c", w: "b"});
	});

	it("tips the cube south", () => {
		expect(roll(labelled, "S")).toStrictEqual({s: "r", b: "g", n: "o", t: "y", e: "c", w: "b"});
	});

	it("keeps each direction's own key order, which saved states expose", () => {
		expect((["E", "W", "N", "S"] as const).map((d) => Object.keys(roll(labelled, d)).join(""))).toStrictEqual([
			"tebwns",
			"twbens",
			"nbstew",
			"sbntew",
		]);
	});
});

describe("cube constants", () => {
	it("lists the faces and directions in their original order", () => {
		expect({FACES, DIRS}).toStrictEqual({
			FACES: ["t", "b", "n", "s", "e", "w"],
			DIRS: {N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0]},
		});
		expect(Object.keys(DIRS)).toStrictEqual(["N", "S", "E", "W"]);
	});

	it("starts bare", () => {
		expect(blank()).toStrictEqual({t: "", b: "", n: "", s: "", e: "", w: ""});
	});
});

describe("solidColor and workColor", () => {
	it("a bare cube has no solid color and works white pieces", () => {
		expect([solidColor(blank()), workColor(blank())]).toStrictEqual(["", "w"]);
	});

	it("a fully coated cube is solid and works its own color", () => {
		expect([solidColor(solid("r")), workColor(solid("r"))]).toStrictEqual(["r", "r"]);
	});

	it("a partly painted cube is neither", () => {
		const partly: Faces = {...blank(), t: "r"};
		expect([solidColor(partly), workColor(partly)]).toStrictEqual(["", ""]);
	});

	it("two colors are not solid even when every face is painted", () => {
		const mixed: Faces = {...solid("r"), w: "b"};
		expect([solidColor(mixed), workColor(mixed)]).toStrictEqual(["", ""]);
	});
});
