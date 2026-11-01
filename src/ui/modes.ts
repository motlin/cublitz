import {renderBoard} from "./board.ts";
import {$, domValue} from "./dom.ts";
import {editorId, loadIntoEditor, renderEditor} from "./editor.ts";
import {campaignLvl, infinite, leaveInfinite} from "./infinite-mode.ts";
import {loadLevel} from "./play.ts";
import {S} from "./session.ts";
import {queueTips} from "./tips.ts";
import {renderTitle} from "./title.ts";

export type Mode = "title" | "play" | "edit";
export let mode: Mode = "title";

export function setMode(m: Mode): void {
	mode = m;
	$("titleView").hidden = m !== "title";
	$("topbar").hidden = m === "title";
	if (m === "title") {
		renderTitle();
		$("palette").hidden = true;
	}
	$("playView").hidden = m !== "play";
	$("levels").hidden = m !== "play" || infinite;
	$("editView").hidden = m !== "edit";
	$("modePlay").setAttribute("aria-pressed", domValue(m === "play"));
	$("modeEdit").setAttribute("aria-pressed", domValue(m === "edit"));
	const h = m === "edit" ? "#editor" : "";
	if (location.hash !== h) {
		try {
			history.replaceState(null, "", h || location.pathname + location.search);
		} catch {
			location.hash = h;
		}
	}
	if (m === "play" && S) {
		renderBoard();
		if ($("tip").hidden) queueTips(S.L);
	}
	if (m === "edit") renderEditor();
}

export function initModes(): void {
	$("modePlay").addEventListener("click", () => {
		if (infinite || !S || S.lvl < 0) {
			leaveInfinite();
			loadLevel(campaignLvl);
		}
		setMode("play");
	});
	$("modeEdit").addEventListener("click", () => {
		setMode("edit");
	});
	$("backEdit").addEventListener("click", () => {
		setMode("edit");
	});
	$("editCopy").addEventListener("click", () => {
		loadIntoEditor(S.L, S.lvl === -1 ? S.L.name! : S.L.name + " remix", S.lvl === -1 ? editorId() : null);
		leaveInfinite();
		setMode("edit");
	});
	addEventListener("hashchange", () => {
		setMode(location.hash === "#editor" ? "edit" : mode === "title" ? "title" : "play");
	});
}
