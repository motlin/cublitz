import {describe, expect, it} from "vite-plus/test";
import {hintTier, type Milestone, milestoneReached, nextMilestone} from "../../../src/core/hints.ts";
import {initState} from "../../../src/core/level.ts";
import {LEVELS} from "../../../src/core/levels.ts";
import {tryMove} from "../../../src/core/rules.ts";
import {solve} from "../../../src/core/solver.ts";
import type {Direction, MoveSuccess} from "../../../src/core/types.ts";
import {readSolveGolden} from "../../support/golden.ts";

const golden = readSolveGolden("solve-post-fix.json");

/** Asks for a hint before every roll of a level's recorded solution, then for more until the route shows, as a
 * player reading every hint would, the way the page plans each one. Gives each roll's milestone and the tier its
 * hint opened at, with a run of identical rolls as one entry. */
function hintsAlong(index: number): string[]
{
	const level = LEVELS[index]!;
	let st = initState(level);
	let shown:
	{
		m: Milestone;
		tier: number;
	} | null = null;
	const runs: [string, number][] = [];
	for (const d of golden[index]!.path!)
	{
		const m = nextMilestone(level, st, solve(level, st, 1500000)!)!;
		const seen = `${m.type} ${hintTier(shown, m, false)}`;
		const last = runs[runs.length - 1];
		if (last?.[0] === seen) last[1]++;
		else runs.push([seen, 1]);
		shown =
		{
			m,
			tier: 3,
		};
		const r = tryMove(level, st, d as Direction) as MoveSuccess;
		// A reached milestone closes its hint, and anything else leaves it up for the next press to plan again.
		if (milestoneReached(m, r)) shown = null;
		st = r.st;
	}
	return runs.map(([seen, n]) => (n === 1 ? seen : `${seen} x${n}`));
}

describe("hints along a level's solution", () =>
{
	it("level 2 First Coat: the gate, then the target", () =>
	{
		expect(hintsAlong(1)).toStrictEqual(["gate 1", "gate 3 x4", "goal 1"]);
	});

	it("level 5 Crown: a second gate starts over at the first tier", () =>
	{
		expect(hintsAlong(4)).toStrictEqual(["gate 1", "gate 3 x9", "gate 1", "goal 1", "goal 3 x5"]);
	});

	it("level 9 Full Dip: coat, switch, then the door on the way to the target", () =>
	{
		expect(hintsAlong(8)).toStrictEqual([
			"solid 1",
			"solid 3 x11",
			"switch 1",
			"switch 3 x2",
			"goal 1",
			"goal 3",
			"door 1",
			"goal 1",
		]);
	});

	it("level 10 Box Step: coat, box onto its button, then the door on the way to the target", () =>
	{
		expect(hintsAlong(9)).toStrictEqual([
			"solid 1",
			"solid 3 x12",
			"button 1",
			"button 3 x5",
			"goal 1",
			"goal 3 x2",
			"door 1",
			"goal 1",
		]);
	});

	it("level 22 Eastern Window: the named white gate, then the target", () =>
	{
		expect(hintsAlong(21)).toStrictEqual(["wgate 1", "wgate 3 x8", "goal 1"]);
	});

	it("level 29 Clean Push: gate, paint remover, box onto its button, then the door on the way to the target", () =>
	{
		expect(hintsAlong(28)).toStrictEqual([
			"gate 1",
			"gate 3 x7",
			"wash 1",
			"wash 3",
			"button 1",
			"button 3 x4",
			"goal 1",
			"goal 3",
			"door 1",
			"goal 1",
		]);
	});
});

describe("hintTier", () =>
{
	const level = LEVELS[1]!;
	const gate = nextMilestone(level, initState(level), golden[1]!.path!)!;
	const tierAfter = (m: Milestone | null, tier: number, more: boolean) =>
		hintTier(
			m &&
			{
				m,
				tier,
			},
			gate,
			more,
		);

	it("opens a first hint, or one pointing somewhere new, at the first tier, even when asked for more", () =>
	{
		const elsewhere: Milestone =
		{
			...gate,
			x: gate.x + 1,
		};
		const goal: Milestone =
		{
			...gate,
			type: "goal",
		};
		expect([
			tierAfter(null, 2, false),
			tierAfter(null, 2, true),
			tierAfter(elsewhere, 2, true),
			tierAfter(goal, 2, true),
		]).toStrictEqual([1, 1, 1, 1]);
	});

	it("keeps the tier at the same milestone planned from elsewhere, one further when asked for more, up to the third", () =>
	{
		const later: Milestone =
		{
			...gate,
			i: gate.i - 1,
			path: gate.path.slice(1),
		};
		expect([
			tierAfter(later, 1, false),
			tierAfter(later, 1, true),
			tierAfter(later, 2, true),
			tierAfter(later, 3, true),
		]).toStrictEqual([1, 2, 3, 3]);
	});
});
