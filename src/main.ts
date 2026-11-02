import {LEVELS} from "./core/levels.ts";
import {initBoardElement} from "./ui/board.ts";
import type {HotData} from "./ui/dom.ts";
import {initEditor, loadEditorDraft} from "./ui/editor.ts";
import {initHints} from "./ui/hint.ts";
import {initInfinite} from "./ui/infinite-mode.ts";
import {initInput} from "./ui/input.ts";
import {initModes, mode, setMode} from "./ui/modes.ts";
import {initOverlays} from "./ui/overlays.ts";
import {initPalette} from "./ui/palette.ts";
import {loadLevel} from "./ui/play.ts";
import {initPwa} from "./ui/pwa.ts";
import {beaten, loadProgress, loadReducedMotion, S, unlocked} from "./ui/session.ts";
import {initSound} from "./ui/sfx.ts";
import {openSharedLink} from "./ui/shared-link.ts";
import {initSolution} from "./ui/solution.ts";
import {initTips} from "./ui/tips.ts";
import {initTitle} from "./ui/title.ts";
import {initTouch} from "./ui/touch.ts";

// The ui modules do nothing until they are called, so this list alone decides what happens at startup.
// It follows the original script from top to bottom. Listeners on one target fire in the order they were
// added, and the document's keydown listeners in input, palette and title depend on that order.
loadProgress();
initBoardElement();
loadReducedMotion();
initTips();
initSolution();
initOverlays();
initInfinite();
initHints();
initInput();
initModes();
initEditor();
initPalette();
initTitle();
initSound();
initTouch();

loadEditorDraft();
window.claude?.hot?.snapshot?.(() =>
	S && S.lvl >= 0 ? {lvl: S.lvl, name: S.L.name, st: S.st, hist: S.hist, mode} : {mode},
);
function start(data?: HotData): void {
	const restoring =
		data &&
		typeof data.lvl === "number" &&
		LEVELS[data.lvl] &&
		LEVELS[data.lvl]?.name === data.name &&
		unlocked(data.lvl) &&
		data.st?.boxes;
	if (restoring) loadLevel(data.lvl!, data);
	else {
		const firstOpen = LEVELS.findIndex((L) => !beaten(L));
		loadLevel(firstOpen < 0 ? 0 : firstOpen);
	}
	setMode("title");
	if (!restoring) openSharedLink(location.search);
}
// Each read of the hooks stays as the original wrote it. An uncaught error names the expression that failed,
// and a host's accessor on hot sees every read.
// oxlint-disable-next-line no-unused-expressions
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
initPwa();
