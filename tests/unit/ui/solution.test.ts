import {describe, expect, it} from "vite-plus/test";
import {initState} from "../../../src/core/level.ts";
import {LEVELS} from "../../../src/core/levels.ts";
import {tryMove} from "../../../src/core/rules.ts";
import type {MoveSuccess} from "../../../src/core/types.ts";
import {followSolution, revealedToNextGoal} from "../../../src/ui/solution.ts";
import {readSolveGolden} from "../../support/golden.ts";

const golden = readSolveGolden("solve-post-fix.json");
// Full Dip: coat the cube, flip the switch, then through the door to the target.
const level = LEVELS[8]!;
const path = golden[8]!.path!;
const start = initState(level);

describe("revealedToNextGoal", () =>
{
	it("reveals up to each next milestone in turn, then the whole path", () =>
	{
		const shown = [1];
		while (shown[shown.length - 1]! < path.length)
			shown.push(revealedToNextGoal(level, start, path, shown[shown.length - 1]!));
		expect(shown).toStrictEqual([1, 12, 15, 19]);
	});
});

describe("followSolution", () =>
{
	const next = (tryMove(level, start, "E") as MoveSuccess).st;

	it("drops the roll just made, keeping one fewer arrow but at least one", () =>
	{
		expect([
			followSolution(
				{
					path,
					revealed: 3,
					at: start,
				},
				"E",
				start,
			),
			followSolution(
				{
					path,
					revealed: 1,
					at: start,
				},
				"E",
				start,
			),
		]).toStrictEqual([
			{
				path: path.slice(1),
				revealed: 2,
			},
			{
				path: path.slice(1),
				revealed: 1,
			},
		]);
	});

	it("ends once the last roll is made", () =>
	{
		expect(
			followSolution(
				{
					path: "E",
					revealed: 1,
					at: start,
				},
				"E",
				start,
			),
		).toStrictEqual(
			{
				path: "",
				revealed: 0,
			},
		);
	});

	it("has to be planned again after a roll off the path, or from a position it was not planned from", () =>
	{
		expect([
			followSolution(
				{
					path,
					revealed: 3,
					at: start,
				},
				"N",
				start,
			),
			followSolution(
				{
					path,
					revealed: 3,
					at: start,
				},
				"E",
				next,
			),
			followSolution(
				{
					path: "",
					revealed: 1,
					at: start,
				},
				"E",
				start,
			),
		]).toStrictEqual([null, null, null]);
	});
});
