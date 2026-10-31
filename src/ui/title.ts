import {LEVELS} from "../core/levels.ts";
import {$} from "./dom.ts";
import {best, leaveInfinite, run} from "./infinite-mode.ts";
import {mode, setMode} from "./modes.ts";
import {loadLevel} from "./play.ts";
import {beaten, S, unlocked} from "./session.ts";
import {SFX} from "./sfx.ts";

// Title screen
export function renderTitle(): void {
	const cleared = LEVELS.filter((L) => beaten(L)).length;
	const next = LEVELS.findIndex((L, i) => unlocked(i) && !beaten(L));
	if (!cleared) {
		$("titlePlay").textContent = "Play";
		$("titleProgress").textContent = `${LEVELS.length} levels`;
	} else if (next < 0) {
		$("titlePlay").textContent = "Play again";
		$("titleProgress").textContent = `All ${LEVELS.length} levels cleared`;
	} else {
		$("titlePlay").textContent = `Continue · Level ${next + 1}`;
		$("titleProgress").textContent = `${cleared} of ${LEVELS.length} levels cleared`;
	}
	if (best.cleared) $("titleProgress").textContent += ` · Infinite best ${best.cleared}`;
	$("titleInf").textContent = run && run.n ? `Infinite · Canvas ${run.n + 1}` : "Infinite mode";
}

export function initTitle(): void {
	$("titlePlay").onclick = () => {
		SFX.play("start");
		const next = LEVELS.findIndex((L, i) => unlocked(i) && !beaten(L));
		leaveInfinite();
		if (!S || S.lvl !== (next < 0 ? 0 : next)) loadLevel(next < 0 ? 0 : next);
		setMode("play");
	};
	$("titleEdit").onclick = () => setMode("edit");
	document.querySelector("header .brand")!.addEventListener("click", () => setMode("title"));
	document.addEventListener("keydown", (e) => {
		if (
			mode === "title" &&
			(e.key === "Enter" || e.key === " ") &&
			!/BUTTON|INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")
		) {
			e.preventDefault();
			$("titlePlay").click();
		}
	});
}
