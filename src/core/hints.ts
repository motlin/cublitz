import {FACES, roll} from "./cube.ts";
import {cellAt, needEntries} from "./level.ts";
import {CNAME, dirWord, FNAME, howWork, list, wgateName} from "./names.ts";
import {restsOn, solidColorOf, workColorOf} from "./prism.ts";
import {openColors, tryMove} from "./rules.ts";
import type {Box, Direction, Face, Level, MoveSuccess, Paint, PieceColor, State, SwitchCell} from "./types.ts";

type Push =
{
	d: Direction;
	box: number;
};
type MilestoneBase =
{
	i: number;
	d: Direction;
	x: number;
	y: number;
	path: string;
	prev: State;
	paints: Paint[];
};
export type Milestone = MilestoneBase &
	(
		|
		  {
				type: "goal";
		  }
		|
		  {
				type: "gate";
				c: Paint;
		  }
		|
		  {
				type: "wgate";
				f: Face;
		  }
		|
		  {
				type: "wash";
		  }
		|
		  {
				type: "switch";
				c: PieceColor;
		  }
		|
		  {
				type: "solid";
				c: Paint;
		  }
		|
		  {
				type: "button";
				c: PieceColor;
				box: number;
				firstPush: Push;
				from: Box;
		  }
		|
		  {
				type: "door";
				c: PieceColor;
		  }
		|
		  {
				type: "merge";
		  }
	);

/** The first thing worth pointing out along sol, which has to be a path that works from st0. */
export function nextMilestone(L: Level, st0: State, sol: string): Milestone | null
{
	let st = st0;
	const paints: Paint[] = [],
		pushes: Push[] = [];
	for (let i = 0; i < sol.length; i++)
	{
		const d = sol[i] as Direction,
			prev = st,
			r = tryMove(L, st, d) as MoveSuccess;
		st = r.st;
		const base: MilestoneBase =
		{
			i,
			d,
			x: r.nx,
			y: r.ny,
			path: sol.slice(0, i + 1),
			prev,
			paints: [...new Set(paints)],
		};
		if (r.painted) paints.push(r.painted);
		if (r.pushed >= 0)
			pushes.push(
				{
					d,
					box: r.pushed,
				},
			);
		const now = solidColorOf(st),
			before = solidColorOf(prev);
		if (r.won)
			return {
				...base,
				type: "goal",
			};
		if (r.merged)
			return {
				...base,
				type: "merge",
			};
		if (r.cell.t === "gate" && !before)
			return {
				...base,
				type: "gate",
				c: r.cell.c,
			};
		if (r.cell.t === "wgate")
			return {
				...base,
				type: "wgate",
				f: r.cell.f,
			};
		if (r.washed)
			return {
				...base,
				type: "wash",
			};
		// Only a switch cell ever reports a flip.
		if (r.flipped >= 0)
			return {
				...base,
				type: "switch",
				c: (r.cell as SwitchCell).c,
			};
		if (now && now !== before)
			return {
				...base,
				type: "solid",
				c: now,
			};
		if (r.pushed >= 0)
		{
			const b = st.boxes[r.pushed]!,
				cell = cellAt(L, b.x, b.y);
			if (cell?.t === "button" && cell.c === b.c)
				return {
					...base,
					type: "button",
					c: b.c,
					x: b.x,
					y: b.y,
					box: r.pushed,
					firstPush: pushes.find((p) => p.box === r.pushed)!,
					from: st0.boxes[r.pushed]!,
				};
		}
		if (r.cell.t === "door" && !(prev.x === r.nx && prev.y === r.ny))
		{
			const wasOpen = openColors(L, st0)[r.cell.c];
			if (!wasOpen || i === 0)
				return {
					...base,
					type: "door",
					c: r.cell.c,
				};
		}
	}
	return null;
}

/** Whether the roll r, made while m was the hint, carried out m. */
export function milestoneReached(m: Milestone, r: MoveSuccess): boolean
{
	const st = r.st;
	if (m.type === "gate" || m.type === "door" || m.type === "wgate" || m.type === "wash") return restsOn(st, m.x, m.y);
	if (m.type === "merge") return !!r.merged;
	if (m.type === "switch") return r.flipped >= 0 && r.nx === m.x && r.ny === m.y;
	if (m.type === "solid") return solidColorOf(st) === m.c;
	if (m.type === "button") return st.boxes[m.box]!.x === m.x && st.boxes[m.box]!.y === m.y;
	return false;
}

// Which face, before rolling d, ends up as face k after the roll
export const preFace = (d: Direction, k: Face): Face =>
	roll<Face>(
		{
			t: "t",
			b: "b",
			n: "n",
			s: "s",
			e: "e",
			w: "w",
		},
		d,
	)[k];
const OPP: Record<Direction, string> =
{
	N: "south",
	S: "north",
	E: "west",
	W: "east",
};

/** The hint for a milestone: first what to do next, then how to do it. */
export function hintTexts(L: Level, st: State, m: Milestone): [string, string]
{
	const cn = ("c" in m ? CNAME[m.c] : "") || "";
	const cubes = st.units?.map((u) => u.f) ?? [st.f];
	const has = (c: Paint | PieceColor) => cubes.some((f) => FACES.some((k) => f[k] === c));
	switch (m.type)
	{
		case "goal":
		{
			const need = needEntries(L);
			const missing = [...new Set(need.map(([, v]) => v))].filter((c) => !has(c)).map((c) => CNAME[c]);
			const prep = missing.length ? ` You'll need ${list(missing)} paint for that.` : "";
			return [
				need.length
					? `Head for the target. It wants ${list(need.map(([k, v]) => `${CNAME[v]} on ${FNAME[k]}`))}.${prep}`
					: `Head for the target.`,
				need.length
					? `Arrive rolling ${dirWord(m.d)}. Just before that last roll, have ${list(need.map(([k, v]) => `${CNAME[v]} on your ${FNAME[preFace(m.d, k)]} face`))}.`
					: `Arrive rolling ${dirWord(m.d)}. Nothing else is required.`,
			];
		}
		case "merge":
			return [
				"Next, merge with the highlighted cube.",
				`Press ${dirWord(m.d)} into it. The cubes join without moving, and from then on they roll as one block.`,
			];
		case "wash":
			return [
				"Next, roll onto the highlighted paint remover.",
				`It wipes all six faces back to bare at once. Use up any paint you still need first, like a gate's color or a switch's solid coat.`,
			];
		case "wgate":
		{
			const pf = preFace(m.d, m.f),
				bare = cubes.reduce((n, f) => n + FACES.filter((k) => !f[k]).length, 0);
			return [
				`Your next goal is the highlighted ${wgateName(m.f)}. You have ${bare} bare face${bare === 1 ? "" : "s"} left.`,
				`Roll onto it heading ${dirWord(m.d)}. That roll moves your ${FNAME[pf]} face to the ${FNAME[m.f]}, so keep your ${FNAME[pf]} face bare until then. Plan which faces the puddles on the way are allowed to paint.`,
			];
		}
		case "gate":
			return [
				`Your next goal is the highlighted ${cn} gate.${has(m.c) ? "" : ` You'll need ${cn} paint first.`}`,
				`Roll onto it heading ${dirWord(m.d)}. That roll turns your ${FNAME[preFace(m.d, "b")]} face down, so that face needs to be ${cn} first.`,
			];
		case "solid":
			return [
				`Next, coat all six faces ${cn} on the highlighted puddles.`,
				`Rolling straight back and forth only reaches four faces. Turn a corner while you're on the ${cn} puddles to reach the other two. The face map shows which ones are still bare.`,
			];
		case "switch":
			return [
				`Next, flip the highlighted ${cn} switch.`,
				workColorOf(st) === m.c
					? `You're ${howWork(m.c)} already. Roll onto it from any side.`
					: `It only flips for a cube that is ${howWork(m.c)} when it lands.`,
			];
		case "button":
		{
			const fp = m.firstPush;
			return [
				`Next, get the ${cn} box onto the highlighted ${cn} button.`,
				`Start by pushing the box ${dirWord(fp.d)}. To push, roll into it from its ${OPP[fp.d]} side while ${howWork(m.c)}.`,
			];
		}
		case "door":
			return [
				`Next, get through the highlighted ${cn} door.`,
				`It has to be open as you finish the roll onto it. A flipped ${cn} switch, or a ${cn} box sitting on a ${cn} button, keeps it open.`,
			];
		default:
			throw new Error("Unknown milestone type");
	}
}
