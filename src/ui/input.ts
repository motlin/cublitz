import {LEVELS} from "../core/levels.ts";
import type {Direction} from "../core/types.ts";
import {renderBoard} from "./board.ts";
import {$} from "./dom.ts";
import {renderEditor} from "./editor.ts";
import {hint} from "./hint.ts";
import {campaignLvl, loadInfLevel} from "./infinite-mode.ts";
import {mode, setMode} from "./modes.ts";
import {loadLevel, loadMergeLevel, mergeIndex, move, restart, SHARED, undo} from "./play.ts";
import {S} from "./session.ts";
import {dismissTip, tipOpen} from "./tips.ts";

export const KEYMAP: Record<string, Direction> = {
	ArrowUp: "N",
	ArrowDown: "S",
	ArrowLeft: "W",
	ArrowRight: "E",
	w: "N",
	s: "S",
	a: "W",
	d: "E",
	W: "N",
	S: "S",
	A: "W",
	D: "E",
};

/** The roll a pointer drag asks for, or null when it was too short to be a swipe. */
export function swipeDirection(dx: number, dy: number): Direction | null {
	if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return null;
	return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N";
}

let touch0: [number, number] | null = null;
let rt: ReturnType<typeof setTimeout>;

export function initInput(): void {
	$("undoBtn").onclick = undo;
	$("resetBtn").onclick = restart;
	$("hintBtn").onclick = () => hint();
	$("winRetry").onclick = restart;
	$("winNext").onclick = () =>
		S.lvl === -2
			? loadInfLevel()
			: S.lvl === SHARED
				? loadLevel(campaignLvl)
				: mergeIndex(S.lvl) >= 0
					? loadMergeLevel(mergeIndex(S.lvl) + 1)
					: S.lvl < 0
						? setMode("edit")
						: loadLevel(Math.min(S.lvl + 1, LEVELS.length - 1));
	document
		.querySelectorAll<HTMLElement>(".dpad button")
		.forEach((b) => b.addEventListener("click", () => move(b.dataset["d"] as Direction)));

	document.addEventListener("keydown", (e) => {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (mode !== "play" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
		if (tipOpen()) {
			if (["Enter", " ", "Escape"].includes(e.key)) {
				e.preventDefault();
				dismissTip();
			} else if (KEYMAP[e.key]) e.preventDefault();
			return;
		}
		if (KEYMAP[e.key]) {
			e.preventDefault();
			move(KEYMAP[e.key]!);
			return;
		}
		const k = e.key.toLowerCase();
		if (k === "z" || e.key === "Backspace") {
			e.preventDefault();
			undo();
		} else if (k === "r") restart();
		else if (k === "h") hint();
		else if (e.key === "Enter" && S.won && !$("winNext").hidden) {
			e.preventDefault();
			$("winNext").click();
		}
	});

	// Swipe
	$("viewport").addEventListener("pointerdown", (e) => {
		touch0 = [e.clientX, e.clientY];
	});
	$("viewport").addEventListener("pointerup", (e) => {
		if (!touch0) return;
		const dx = e.clientX - touch0[0],
			dy = e.clientY - touch0[1];
		touch0 = null;
		const d = swipeDirection(dx, dy);
		if (d) move(d);
	});

	addEventListener("resize", () => {
		clearTimeout(rt);
		rt = setTimeout(() => {
			if (mode === "play") {
				if (S && !S.busy) renderBoard();
			} else renderEditor();
		}, 120);
	});
}
