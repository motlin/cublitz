import {describe, expect, it} from "vite-plus/test";
import {initState} from "../../../src/core/level.ts";
import {LEVELS} from "../../../src/core/levels.ts";
import {solve} from "../../../src/core/solver.ts";
import {readSolveGolden} from "../../support/golden.ts";
import {loadExpectedEngine} from "../../support/original-engine.ts";

const golden = readSolveGolden("solve-post-fix.json");

describe("LEVELS", () => {
	const solved = LEVELS.map((level, index) => {
		const path = solve(level, initState(level));
		return {
			index,
			name: level.name ?? "",
			par: level.par ?? null,
			path,
			hitLimit: solve.hitLimit,
		};
	});

	it("is the original's data with the intentional divergences applied, parsed, with the same key order", () => {
		expect(JSON.stringify(LEVELS)).toBe(JSON.stringify(loadExpectedEngine().LEVELS));
	});

	it("plays Crown fifth and Checkpoints sixth, the reverse of the original", () => {
		expect([4, 5].map((index) => [LEVELS[index]?.name, LEVELS[index]?.par])).toStrictEqual([
			["Crown", 17],
			["Checkpoints", 19],
		]);
	});

	it("has Two Sides say what is true of that level, which has no paint remover", () => {
		const twoSides = LEVELS[22];
		expect([twoSides?.name, twoSides?.tip]).toStrictEqual([
			"Two Sides",
			"West bare for the first wall, top bare for the second. Nothing here takes paint off.",
		]);
		expect(twoSides?.map.join("").includes("Z")).toBe(false);
	});

	it("has the reworded tips on Prism, Two Rooms, Ladder, Spectrum, Blank Slate and Eastern Window", () => {
		expect([7, 14, 16, 17, 20, 21].map((index) => [LEVELS[index]?.name, LEVELS[index]?.tip])).toStrictEqual([
			["Prism", "Clear a red gate and a blue wall, then finish with green on top and blue facing north."],
			[
				"Two Rooms",
				"Red box on the red button, blue box on the blue button. You’ll have to change color halfway.",
			],
			[
				"Ladder",
				"Three new paints: orange, purple and cyan. The wall runs orange, purple, cyan, orange, so orange goes on two opposite faces.",
			],
			["Spectrum", "Arrive with cyan on top, orange north, purple south and blue west."],
			[
				"Blank Slate",
				"White gates want an unpainted face. This one needs it facing down, and the paint field is in the way.",
			],
			[
				"Eastern Window",
				"A white gate’s arrow points at the side that must still be bare when you land. Here, east.",
			],
		]);
	});

	it("solves every level to the golden result", () => {
		expect(solved).toStrictEqual(golden);
	});

	it("has a shortest solution of exactly par on every level", () => {
		expect(solved.map((entry) => entry.path?.length)).toStrictEqual(LEVELS.map((level) => level.par));
	});
});
