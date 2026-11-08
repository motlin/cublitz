import {expect, test} from "vite-plus/test";
import type {Direction, MoveFailure} from "../../../src/core/types.ts";
import {blockedText} from "../../../src/ui/play.ts";
import {engine} from "../../support/engine.ts";
import {findBlockedMove} from "../../support/paths.ts";

/** The status a refused roll shows, at the first spot on the level where a roll is refused for that reason. */
const blockedOn = (index: number, why: string, accept?: (r: Record<string, unknown>) => boolean): string =>
{
	const level = engine.LEVELS[index]!;
	const found = findBlockedMove(engine, level, why, accept);
	if (!found) throw new Error(`No ${why} block on level ${index}`);
	let state = engine.initState(level);
	for (const d of found.path)
		state = (
			engine.tryMove(level, state, d) as
			{
				st: typeof state;
			}
		).st;
	return blockedText(engine.tryMove(level, state, found.dir) as MoveFailure, found.dir as Direction);
};

test("each reason a roll is refused on the campaign levels has its own status", () =>
{
	expect([
		blockedOn(0, "edge"),
		blockedOn(2, "gate", (r) => !r["down"]),
		blockedOn(3, "gate", (r) => !!r["down"] && r["down"] !== r["c"]),
		blockedOn(20, "wgate", (r) => r["f"] === "b"),
		blockedOn(21, "wgate"),
		blockedOn(8, "door"),
		blockedOn(9, "box"),
		blockedOn(29, "box", (r) => r["c"] === "w"),
		blockedOn(9, "stuck"),
	]).toStrictEqual([
		"<b>Edge.</b> Nothing to roll onto that way.",
		"<b>Blue gate.</b> Rolling east would put a bare face down.",
		"<b>Blue gate.</b> Rolling south would put red face down.",
		"<b>White gate.</b> It needs a bare face down, but rolling east would put red down.",
		"<b>East white gate.</b> Your east face has to be bare when you land, but it would be blue.",
		"<b>Red door is shut.</b> Flip a red switch or hold down a red button.",
		"<b>Blue box.</b> Only a cube painted solid blue can push it.",
		"<b>White box.</b> Only a completely bare cube can push it.",
		"<b>The box won't budge.</b> Something is in the way on the other side.",
	]);
});

test("a block of cubes is refused for its own reasons", () =>
{
	const at =
	{
		ok: false,
		nx: 0,
		ny: 0,
	} as const;
	expect([
		blockedText(
			{
				...at,
				why: "misaligned",
			},
			"E",
		),
		blockedText(
			{
				...at,
				why: "heavy",
			},
			"E",
		),
	]).toStrictEqual([
		"<b>Not lined up.</b> A block only takes on a cube straight ahead while lying along that line.",
		"<b>Too clumsy.</b> A block of cubes can't push a box.",
	]);
});
