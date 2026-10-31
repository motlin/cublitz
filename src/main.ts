import {LEVELS} from "./core/levels.ts";
import {gameWindow, type HotData} from "./ui/dom.ts";
import {initEditor, loadEditorDraft} from "./ui/editor.ts";
import {initHints} from "./ui/hint.ts";
import {initInfinite} from "./ui/infinite-mode.ts";
import {initInput} from "./ui/input.ts";
import {initModes, mode, setMode} from "./ui/modes.ts";
import {initOverlays} from "./ui/overlays.ts";
import {initPalette} from "./ui/palette.ts";
import {loadLevel} from "./ui/play.ts";
import {beaten, loadProgress, loadReducedMotion, S, unlocked} from "./ui/session.ts";
import {initSound} from "./ui/sfx.ts";
import {initSolution} from "./ui/solution.ts";
import {initTips} from "./ui/tips.ts";
import {initTitle} from "./ui/title.ts";

// The ui modules do nothing until they are called, so this list alone decides what happens at startup.
// It follows the original script from top to bottom. Listeners on one target fire in the order they were
// added, and the document's keydown listeners in input, palette and title depend on that order.
loadProgress();
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

loadEditorDraft();
gameWindow().claude?.hot?.snapshot?.(() => (S && S.lvl >= 0 ? {lvl: S.lvl, st: S.st, hist: S.hist, mode} : {mode}));
function start(data?: HotData): void {
	if (data && typeof data.lvl === "number" && LEVELS[data.lvl] && unlocked(data.lvl) && data.st && data.st.boxes) loadLevel(data.lvl, data);
	else {
		const firstOpen = LEVELS.findIndex((L) => !beaten(L));
		loadLevel(firstOpen < 0 ? 0 : firstOpen);
	}
	setMode("title");
}
const hot = gameWindow().claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
