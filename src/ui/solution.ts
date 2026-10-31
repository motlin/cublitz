import {nextMilestone} from "../core/hints.ts";
import {tryMove} from "../core/rules.ts";
import {solve} from "../core/solver.ts";
import type {Direction, MoveSuccess, State} from "../core/types.ts";
import {$} from "./dom.ts";
import {clearHint} from "./hint.ts";
import {scheduleOverlays} from "./overlays.ts";
import {reduced, S} from "./session.ts";

// Show solution: arrows laid down a few at a time
export type SolutionState = {path: string; revealed: number; at: State; used: boolean};
export let solState: SolutionState | null = null;
let solTimer: ReturnType<typeof setInterval> | null = null;

export function stopAutoReveal(): void {
	clearInterval(solTimer!);
	solTimer = null;
	$("solAll").textContent = "Reveal the rest";
}
export function clearSolution(): void {
	stopAutoReveal();
	$("solBox").hidden = true;
	solState = null;
	scheduleOverlays();
}
export function planSolution(keepRevealed?: number): void {
	const at = S.st;
	$("solText").textContent = "Working out the solution…";
	$("solBox").hidden = false;
	setTimeout(() => {
		if (S.st !== at || S.won) return;
		const path = solve(S.L, S.st, 2500000);
		if (!path) {
			$("solText").innerHTML = solve.hitLimit
				? "<b>Too many possibilities.</b> The solver gave up from this position. Try restarting the level."
				: "<b>No way out from here.</b> Undo a few rolls or restart, then ask again.";
			(["solNext", "solGoal", "solAll"] as const).forEach((id) => ($(id).hidden = true));
			if (solState) solState.path = "";
			return;
		}
		const revealed = Math.min(path.length, keepRevealed ?? 1);
		solState = {path, revealed, at, used: true};
		S.usedSolution = true;
		(["solNext", "solGoal", "solAll"] as const).forEach((id) => ($(id).hidden = false));
		renderSolution();
	}, 30);
}
export function renderSolution(): void {
	scheduleOverlays();
	if (!solState || !solState.path) return;
	const {path, revealed} = solState;
	const done = revealed >= path.length;
	$("solText").innerHTML = done
		? `Full solution shown: <b>${path.length} rolls</b> from where you are. Follow the arrows in number order; each one disappears as you roll it.`
		: `Showing <b>${revealed} of ${path.length}</b> rolls. Follow the arrows in number order, or reveal more.`;
	$("solNext").disabled = $("solGoal").disabled = $("solAll").disabled = done;
	if (done) stopAutoReveal();
}
function revealMore(n: number): void {
	if (!solState || !solState.path) return;
	solState.revealed = Math.min(solState.path.length, solState.revealed + n);
	renderSolution();
}
function revealToNextGoal(): void {
	if (!solState || !solState.path) return;
	let st = S.st;
	for (let i = 0; i < solState.revealed; i++)
		st = (tryMove(S.L, st, solState.path[i] as Direction) as MoveSuccess).st;
	const m = nextMilestone(S.L, st, solState.path.slice(solState.revealed));
	revealMore(m ? m.i + 1 : solState.path.length);
}
export function showSolution(): void {
	if (S.busy || S.won || S.lvl === -2) return;
	clearHint();
	if (solState && solState.at === S.st) {
		revealMore(1);
		return;
	}
	planSolution(1);
}
// Called after each successful roll
export function solutionAfterMove(d: Direction): void {
	if (!solState) return;
	if (solState.path && solState.path[0] === d) {
		solState.path = solState.path.slice(1);
		solState.revealed = Math.max(0, solState.revealed - 1);
		solState.at = S.st;
		if (!solState.path) {
			clearSolution();
			return;
		}
		if (solState.revealed === 0) solState.revealed = 1;
		renderSolution();
	} else {
		stopAutoReveal();
		planSolution(solState.revealed);
	}
}

export function initSolution(): void {
	$("solBtn").onclick = showSolution;
	$("solNext").onclick = () => revealMore(1);
	$("solGoal").onclick = revealToNextGoal;
	$("solAll").onclick = () => {
		if (solTimer) {
			stopAutoReveal();
			return;
		}
		$("solAll").textContent = "Pause";
		solTimer = setInterval(
			() => {
				if (!solState || !solState.path || solState.revealed >= solState.path.length) stopAutoReveal();
				else revealMore(1);
			},
			reduced ? 60 : 320,
		);
	};
	$("solHide").onclick = clearSolution;
}
