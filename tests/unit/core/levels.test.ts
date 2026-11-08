import {describe, expect, it} from "vite-plus/test";
import {initState} from "../../../src/core/level.ts";
import {LEVELS} from "../../../src/core/levels.ts";
import {tryMove} from "../../../src/core/rules.ts";
import {encodeLevel} from "../../../src/core/share.ts";
import {solve} from "../../../src/core/solver.ts";
import type {Direction} from "../../../src/core/types.ts";
import {readSolveGolden} from "../../support/golden.ts";

const golden = readSolveGolden("solve-post-fix.json");

// The share code the user sent for their level.
const STINKLEY_TINKLES_CODE =
	"CUBLITZ:eyJuYW1lIjoiU3RpbmtsZXkgdGlua2xlcyIsIm1hcCI6WyIxMTEyLi4uLi4uLi4iLCIxLi4xMTExMTExLi4iLCJTLnJaMzQuLi4uLjEiLCIxLi4xMTE1MS4xLjEiLCIxMS4xMTEuMS4uLjEiLCIxMTYxMTFYMTExMTEiXSwiayI6eyIxIjpbImJveCIsImMiXSwiMiI6WyJidXR0b24iLCJ3Il0sIjMiOlsiZG9vciIsInIiXSwiNCI6WyJib3giLCJ3Il0sIjUiOlsiZG9vciIsInciXSwiNiI6WyJzd2l0Y2giLCJyIl19fQ==";

describe("LEVELS", () =>
{
	const solved = LEVELS.map((level, index) =>
	{
		const path = solve(level, initState(level));
		return {
			index,
			name: level.name ?? "",
			par: level.par ?? null,
			path,
			hitLimit: solve.hitLimit,
		};
	});

	it("plays Crown fifth and Checkpoints sixth, the reverse of the original", () =>
	{
		expect([4, 5].map((index) => [LEVELS[index]?.name, LEVELS[index]?.par])).toStrictEqual([
			["Crown", 17],
			["Checkpoints", 19],
		]);
	});

	it("plays the user's Stinkley tinkles last, after Clean Sweep, with the solver's shortest move count as par", () =>
	{
		const last = LEVELS.slice(-2).map((level) => [level.name, level.par]);
		expect(last).toStrictEqual([
			["Clean Sweep", 40],
			["Stinkley tinkles", 67],
		]);
	});

	it("keeps the user's name, map and legend exactly, so the level encodes back to the user's share code", () =>
	{
		const {name, map, k} = LEVELS.find((level) => level.name === "Stinkley tinkles")!;
		expect(
			encodeLevel(
				{
					name: name!,
					map,
					k: k!,
				},
			),
		).toBe(STINKLEY_TINKLES_CODE);
	});

	it("has Two Sides say what is true of that level, which has no paint remover", () =>
	{
		const twoSides = LEVELS[22];
		expect([twoSides?.name, twoSides?.tip]).toStrictEqual([
			"Two Sides",
			"West bare for the first wall, top bare for the second. Nothing here takes paint off.",
		]);
		expect(twoSides?.map.join("").includes("Z")).toBe(false);
	});

	it("has the reworded tips on Prism, Two Rooms, Ladder, Spectrum, Blank Slate and Eastern Window", () =>
	{
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

	it("solves every level to the golden result", () =>
	{
		expect(solved).toStrictEqual(golden);
	});

	it("has a shortest solution of exactly par on every level", () =>
	{
		expect(solved.map((entry) => entry.path?.length)).toStrictEqual(LEVELS.map((level) => level.par));
	});

	it("wins every level on the golden path's last roll, at exactly par, rolling by the game's rules", () =>
	{
		const played = golden.map(({index, name, path}) =>
		{
			const level = LEVELS[index]!;
			let state = initState(level);
			const rolls: string[] = [];
			for (const direction of path! as Iterable<Direction>)
			{
				const result = tryMove(level, state, direction);
				rolls.push(result.ok ? (result.won ? "won" : "rolled") : `refused ${result.why}`);
				if (!result.ok) break;
				state = result.st;
			}
			return [name, rolls.length, rolls.at(-1), rolls.filter((roll) => roll === "rolled").length];
		});
		expect(played).toStrictEqual(LEVELS.map((level) => [level.name, level.par, "won", level.par! - 1]));
	});
});
