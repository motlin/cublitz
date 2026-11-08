import {nextMilestone} from "../core/hints.ts";
import {tryMove} from "../core/rules.ts";
import {solve} from "../core/solver.ts";
import type {Direction, Level, MoveSuccess, State} from "../core/types.ts";
import {$} from "./dom.ts";
import {clearHint} from "./hint.ts";
import {scheduleOverlays} from "./overlays.ts";
import {reduced, S} from "./session.ts";

// Show solution: arrows laid down a few at a time
export type SolutionState =
{
	path: string;
	revealed: number;
	at: State;
	used: boolean;
};
export let solState: SolutionState | null = null;
let solTimer: ReturnType<typeof setInterval> | null = null;

export function stopAutoReveal(): void
{
	clearInterval(solTimer!);
	solTimer = null;
	$("solAll").textContent = "Reveal the rest";
}
export function clearSolution(): void
{
	stopAutoReveal();
	$("solBox").hidden = true;
	solState = null;
	scheduleOverlays();
}
export function planSolution(keepRevealed?: number): void
{
	const at = S.st;
	$("solText").textContent = "Working out the solution…";
	$("solBox").hidden = false;
	setTimeout(() =>
	{
		if (S.st !== at || S.won) return;
		const path = solve(S.L, S.st, 2500000);
		if (!path)
		{
			$("solText").innerHTML = solve.hitLimit
				? "<b>Too many possibilities.</b> The solver gave up from this position. Try restarting the level."
				: "<b>No way out from here.</b> Undo a few rolls or restart, then ask again.";
			(["solNext", "solGoal", "solAll"] as const).forEach((id) => ($(id).hidden = true));
			if (solState) solState.path = "";
			return;
		}
		const revealed = Math.min(path.length, keepRevealed ?? 1);
		solState =
		{
			path,
			revealed,
			at,
			used: true,
		};
		S.usedSolution = true;
		(["solNext", "solGoal", "solAll"] as const).forEach((id) => ($(id).hidden = false));
		renderSolution();
	}, 30);
}
export function renderSolution(): void
{
	scheduleOverlays();
	if (!solState?.path) return;
	const {path, revealed} = solState;
	const done = revealed >= path.length;
	$("solText").innerHTML = done
		? `Full solution shown: <b>${path.length} rolls</b> from where you are. Follow the arrows in number order; each one disappears as you roll it.`
		: `Showing <b>${revealed} of ${path.length}</b> rolls. Follow the arrows in number order, or reveal more.`;
	$("solNext").disabled = $("solGoal").disabled = $("solAll").disabled = done;
	if (done) stopAutoReveal();
}
function revealMore(n: number): void
{
	if (!solState?.path) return;
	solState.revealed = Math.min(solState.path.length, solState.revealed + n);
	renderSolution();
}
/** How many of path's rolls, planned from st, to show so the arrows reach the next milestone past the revealed ones. */
export function revealedToNextGoal(L: Level, st: State, path: string, revealed: number): number
{
	for (let i = 0; i < revealed; i++) st = (tryMove(L, st, path[i] as Direction) as MoveSuccess).st;
	const m = nextMilestone(L, st, path.slice(revealed));
	return Math.min(path.length, revealed + (m ? m.i + 1 : path.length));
}
function revealToNextGoal(): void
{
	if (!solState?.path || solState.at !== S.st) return;
	solState.revealed = revealedToNextGoal(S.L, S.st, solState.path, solState.revealed);
	renderSolution();
}
export function showSolution(): void
{
	if (S.busy || S.won || S.lvl === -2) return;
	clearHint();
	if (solState && solState.at === S.st)
	{
		revealMore(1);
		return;
	}
	planSolution(1);
}
/** What is left of sol after rolling d from `from`: one roll shorter, still showing at least one arrow while any are
 * left, when d was its next roll from where it was planned, or null when it has to be planned again. A path planned
 * from an older position, still waiting on its re-plan, has to be planned again. */
export function followSolution(
	sol: Pick<SolutionState, "path" | "revealed" | "at">,
	d: Direction,
	from: State | undefined,
):
{
	path: string;
	revealed: number;
} | null
{
	if (!sol.path?.startsWith(d) || sol.at !== from) return null;
	const path = sol.path.slice(1);
	return {
		path,
		revealed: path ? Math.max(1, sol.revealed - 1) : 0,
	};
}
// Called after each successful roll
export function solutionAfterMove(d: Direction): void
{
	if (!solState) return;
	const next = followSolution(solState, d, S.hist[S.hist.length - 1]);
	if (!next)
	{
		stopAutoReveal();
		planSolution(solState.revealed);
		return;
	}
	if (!next.path)
	{
		clearSolution();
		return;
	}
	solState.path = next.path;
	solState.revealed = next.revealed;
	solState.at = S.st;
	renderSolution();
}

export function initSolution(): void
{
	$("solBtn").addEventListener("click", showSolution);
	$("solNext").addEventListener("click", () =>
	{
		revealMore(1);
	});
	$("solGoal").addEventListener("click", revealToNextGoal);
	$("solAll").addEventListener("click", () =>
	{
		if (solTimer)
		{
			stopAutoReveal();
			return;
		}
		$("solAll").textContent = "Pause";
		solTimer = setInterval(
			() =>
			{
				if (!solState?.path || solState.revealed >= solState.path.length) stopAutoReveal();
				else revealMore(1);
			},
			reduced ? 60 : 320,
		);
	});
	$("solHide").addEventListener("click", clearSolution);
}
