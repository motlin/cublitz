import {solidColor} from "../core/cube.ts";
import {hintTexts, type Milestone, nextMilestone} from "../core/hints.ts";
import {solve} from "../core/solver.ts";
import type {MoveSuccess, State} from "../core/types.ts";
import {$} from "./dom.ts";
import {setStatus} from "./hud.ts";
import {scheduleOverlays} from "./overlays.ts";
import {S} from "./session.ts";
import {SFX} from "./sfx.ts";
import {clearSolution, solState} from "./solution.ts";
import {esc} from "./text.ts";

// Hints: next goal, then how, then a route to that goal
export type HintState = {m: Milestone; tier: number; at: State | null};
export let hintState: HintState | null = null;

const mKey = (m: Milestone | null): string => (m ? [m.type, "c" in m ? m.c : undefined, m.x, m.y].join(":") : "");

function clearTrail(): void {
	scheduleOverlays();
}
export function clearHint(keepState?: boolean): void {
	$("hintBox").hidden = true;
	if (!keepState) hintState = null;
	scheduleOverlays();
}
export const clearHintState = (): void => {
	hintState = null;
};
/** Drops the trail while undoing: the next press has to plan again from there. */
export function forgetHintPosition(): void {
	if (hintState) {
		clearTrail();
		hintState.at = null;
	}
}
export function renderHint(): void {
	const {m, tier} = hintState!,
		L = S.L;
	scheduleOverlays();
	const [what, how] = hintTexts(L, S.st, m);
	$("hintStep").textContent = `Hint ${tier} of 3`;
	$("hintText").innerHTML =
		esc(what) +
		(tier >= 2 ? `<br><span class="how">${esc(how)}</span>` : "") +
		(tier >= 3
			? `<br><span class="how">The numbers on the board show a ${m.path.length}-roll route to it.</span>`
			: "");
	$("hintMore").hidden = tier >= 3;
	$("hintMore").textContent = tier === 1 ? "How do I do that?" : "Show me a route";
	$("hintBox").hidden = false;
}
export function hint(more?: boolean): void {
	if (S.busy || S.won || S.lvl === -2) return;
	if (solState) clearSolution();
	if (hintState && hintState.at === S.st) {
		hintState.tier = Math.min(3, hintState.tier + 1);
		renderHint();
		return;
	}
	setStatus("Thinking…");
	const at = S.st;
	setTimeout(() => {
		if (S.st !== at || S.won) return;
		const sol = solve(S.L, S.st, 1500000);
		if (!sol) {
			clearHint();
			setStatus(
				solve.hitLimit
					? "<b>Too many possibilities.</b> The hint gave up on this one."
					: "<b>Stuck.</b> No way to finish from here. Undo or restart.",
				true,
			);
			return;
		}
		const m = nextMilestone(S.L, S.st, sol)!;
		const same = hintState && mKey(hintState.m) === mKey(m);
		SFX.play("hint");
		hintState = {m, tier: same ? Math.min(3, hintState!.tier + (more ? 1 : 0)) : 1, at};
		setStatus("");
		renderHint();
	}, 30);
}
// Called after each successful roll
export function hintAfterMove(r: MoveSuccess): string | undefined {
	if (!hintState) return undefined;
	clearTrail();
	const m = hintState.m,
		st = S.st;
	let done = false;
	if (m.type === "gate" || m.type === "door" || m.type === "wgate" || m.type === "wash")
		done = st.x === m.x && st.y === m.y;
	else if (m.type === "merge") done = !!r.merged;
	else if (m.type === "switch") done = r.flipped >= 0 && r.nx === m.x && r.ny === m.y;
	else if (m.type === "solid") done = solidColor(st.f) === m.c;
	else if (m.type === "button") done = st.boxes[m.box]!.x === m.x && st.boxes[m.box]!.y === m.y;
	if (done) {
		clearHint();
		return "That was the hinted step.";
	}
	hintState.at = null; // the next press re-plans from here
	if (hintState.tier >= 3) {
		$("hintText")
			.querySelectorAll(".how")
			.forEach((e, i) => {
				if (i === 1) e.remove();
			});
	}
	return "";
}

export function initHints(): void {
	$("hintMore").addEventListener("click", () => {
		hint(true);
	});
	$("hintClose").addEventListener("click", () => {
		clearHint();
	});
}
