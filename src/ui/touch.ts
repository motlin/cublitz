import type {Direction, Level} from "../core/types.ts";
import touchCss from "../styles/touch.css?raw";
import {aimTiles, renderBoard} from "./board.ts";
import {$} from "./dom.ts";
import {type CameraMove, fingerGestures, type Gestures} from "./gestures.ts";
import {mode} from "./modes.ts";
import {scheduleOverlays} from "./overlays.ts";
import {move} from "./play.ts";
import {S} from "./session.ts";
import {type BoardFit, type Camera, clampCamera, fitBoard, stepCamera, swipeAxis} from "./touch-geometry.ts";

// The phone layout and its gestures. All of it starts when the query first matches, so a desktop page holds none of
// it: the markup and game.css stay as they are, and a finger on a big touch screen acts as it always did.
const COMPACT = "(pointer: coarse) and (max-width: 932px), (pointer: coarse) and (max-height: 500px)";
const REFIT_RETRY = 60;

let query: MediaQueryList | null = null;
export const isCompact = (): boolean => (query ??= matchMedia(COMPACT)).matches;
export const takesTouch = (e: PointerEvent): boolean => e.pointerType === "touch" && isCompact();

let fit: BoardFit | null = null;
let camera: Camera =
{
	zoom: 1,
	x: 0,
	y: 0,
};
let cameraLevel: Level | null = null;
let fitBtn: HTMLButtonElement | null = null;
let builtSize = "";
let refitTimer: ReturnType<typeof setTimeout> | undefined;
let chromeBuilt = false;
/** The phone's own buttons, each with how it goes back on the page, so they leave it whenever the query stops matching. */
const chromeParts:
{
	el: HTMLElement;
	attach: (el: HTMLElement) => void;
}[] = [];
const PHONE_HELP =
	"One finger paints tiles. Two fingers pan, and pinch to zoom. Puddles, gates, switches, buttons, boxes and doors use the selected color. Placing a start moves it.";
let desktopHelp = "";

/** The surfaces that fingers act on. A surface that is on screen hears every finger on the page, so a pinch can start
 * off its edge, and is told which of them landed elsewhere. */
const surfaces:
{
	fingers: Gestures;
	el: HTMLElement;
}[] = [];
export function addFingerSurface(fingers: Gestures, el: HTMLElement): void
{
	surfaces.push(
		{
			fingers,
			el,
		},
	);
}
const eachSurface =
	(run: (fingers: Gestures, e: PointerEvent) => void) =>
	(e: PointerEvent): void =>
	{
		if (takesTouch(e)) for (const {fingers} of surfaces) run(fingers, e);
	};
function listenToFingers(): void
{
	addEventListener(
		"pointerdown",
		(e) =>
		{
			if (!takesTouch(e)) return;
			const target = e.target as Element;
			for (const {fingers, el} of surfaces)
			{
				if (!el.getClientRects().length) continue;
				const own = el.contains(target) && !target.closest("#fitBtn");
				if (own)
				{
					try
					{
						el.setPointerCapture(e.pointerId);
					}
					catch
					{
						// The finger then stays on the surface only while it stays over it.
					}
				}
				fingers.down(e, !own);
			}
		},
		true,
	);
	addEventListener(
		"pointermove",
		eachSurface((fingers, e) =>
		{
			fingers.move(e);
		}),
		true,
	);
	addEventListener(
		"pointerup",
		eachSurface((fingers, e) =>
		{
			fingers.up(e);
		}),
		true,
	);
	addEventListener(
		"pointercancel",
		eachSurface((fingers, e) =>
		{
			fingers.cancel(e);
		}),
		true,
	);
}

/** The tile size that fits a level into the board's area, remembered for the camera. */
export function compactCell(L: Level): number
{
	const v = $("viewport");
	fit = fitBoard(L.cols, L.rows, v.clientWidth, v.clientHeight, 1 + (L.cubes0?.length ?? 0));
	builtSize = `${v.clientWidth}x${v.clientHeight}`;
	return fit.cell;
}

function drawCamera(): void
{
	if (!fit) return;
	const v = $("viewport");
	camera = clampCamera(
		camera,
		fit,
		{
			width: v.clientWidth,
			height: v.clientHeight,
		},
	);
	const {zoom, x, y} = camera;
	$("board").style.transform =
		`translate(${x - fit.centerX}px, ${y - fit.centerY}px) scale3d(${zoom}, ${zoom}, ${zoom}) rotateX(52deg) rotateZ(18deg)`;
	if (fitBtn) fitBtn.hidden = zoom === 1;
	scheduleOverlays();
}

/** Called after the board is built. A new level starts from the whole level in view. */
export function afterBoardRender(): void
{
	if (!isCompact()) return;
	if (S.L !== cameraLevel)
	{
		cameraLevel = S.L;
		camera =
		{
			zoom: 1,
			x: 0,
			y: 0,
		};
		$("lvTip").classList.remove("open");
	}
	drawCamera();
}

function moveCamera(step: CameraMove): void
{
	camera = stepCamera(camera, step, $("viewport").getBoundingClientRect());
	drawCamera();
}

function resetCamera(): void
{
	camera =
	{
		zoom: 1,
		x: 0,
		y: 0,
	};
	drawCamera();
}

/** Keeps the board fitted to its area, waiting for a roll to end, since a rebuild would strand its animation. */
function refit(): void
{
	clearTimeout(refitTimer);
	if (!isCompact() || mode !== "play" || !S) return;
	const v = $("viewport");
	if (`${v.clientWidth}x${v.clientHeight}` === builtSize) return;
	if (S.busy)
	{
		refitTimer = setTimeout(refit, REFIT_RETRY);
		return;
	}
	renderBoard();
}

function closeMenu(): void
{
	document.querySelector(".app")!.classList.remove("menu-open");
}

/** iOS may still zoom the page whatever touch-action says. It is a guard no browser here can prove. */
function guardPageZoom(): void
{
	document.addEventListener("gesturestart", (e) =>
	{
		if (isCompact()) e.preventDefault();
	});
}

function buildChrome(): void
{
	chromeBuilt = true;
	const style = document.createElement("style");
	style.id = "touchStyle";
	style.media = COMPACT;
	style.textContent = touchCss;
	// After game.css, which sits in the body, so these rules win.
	document.body.append(style);

	const menu = document.createElement("button");
	menu.type = "button";
	menu.id = "menuBtn";
	menu.className = "act";
	menu.textContent = "☰";
	menu.setAttribute("aria-label", "Levels and menu");
	menu.addEventListener("click", () =>
	{
		document.querySelector(".app")!.classList.add("menu-open");
	});
	chromeParts.push(
		{
			el: menu,
			attach: (el) =>
			{
				document.querySelector(".levelhead")!.prepend(el);
			},
		},
	);

	const close = document.createElement("button");
	close.type = "button";
	close.id = "menuClose";
	close.className = "act";
	close.textContent = "×";
	close.setAttribute("aria-label", "Close the menu");
	chromeParts.push(
		{
			el: close,
			attach: (el) =>
			{
				$("topbar").append(el);
			},
		},
	);
	// In the capture phase, because a level's button is gone from the page once its own click has run.
	$("topbar").addEventListener(
		"click",
		(e) =>
		{
			if ((e.target as Element).closest("#levels button, .modes button, .brand, #menuClose")) closeMenu();
		},
		true,
	);

	// Undo, Restart and Hint stay in one row that never scrolls, and everything else opens above it.
	const playView = $("playView");
	const more = document.createElement("button");
	more.type = "button";
	more.id = "moreBtn";
	more.className = "act";
	more.textContent = "⋯";
	more.setAttribute("aria-label", "More actions");
	more.addEventListener("click", () => playView.classList.toggle("more-open"));
	chromeParts.push(
		{
			el: more,
			attach: (el) =>
			{
				$("undoBtn").parentElement!.append(el);
			},
		},
	);
	const closeMore = (e: Event): void =>
	{
		const target = e.target as Element;
		if (target.closest("#moreBtn") || (e.type === "pointerdown" && target.closest("#playView aside .btnrow")))
			return;
		if (e.type === "pointerdown" || target.closest("#playView aside .btnrow"))
			playView.classList.remove("more-open");
	};
	addEventListener("pointerdown", closeMore, true);
	playView.addEventListener("click", closeMore, true);

	fitBtn = document.createElement("button");
	fitBtn.type = "button";
	fitBtn.id = "fitBtn";
	fitBtn.className = "act small";
	fitBtn.textContent = "Fit";
	fitBtn.hidden = true;
	fitBtn.addEventListener("click", resetCamera);
	const viewport = $("viewport");
	chromeParts.push(
		{
			el: fitBtn,
			attach: (el) =>
			{
				viewport.append(el);
			},
		},
	);

	$("lvTip").addEventListener("click", () => $("lvTip").classList.toggle("open"));
	desktopHelp = document.querySelector(".ed-help")!.textContent ?? "";

	const fingers = fingerGestures(
		{
			aim: (swipe) =>
			{
				const d: Direction | null = swipe ? swipeAxis(swipe[0], swipe[1]) : null;
				aimTiles(d);
			},
			swipe: (dx, dy) =>
			{
				move(swipeAxis(dx, dy));
			},
			camera: moveCamera,
			doubleTap: resetCamera,
		},
	);
	addFingerSurface(fingers, viewport);
	listenToFingers();
	guardPageZoom();
	new ResizeObserver(refit).observe(viewport);
}

function showChrome(shown: boolean): void
{
	for (const {el, attach} of chromeParts)
	{
		if (shown) attach(el);
		else el.remove();
	}
	document.querySelector(".ed-help")!.textContent = shown ? PHONE_HELP : desktopHelp;
}

function sync(): void
{
	if (!isCompact())
	{
		$("board").style.transform = "";
		if (chromeBuilt)
		{
			closeMenu();
			$("playView").classList.remove("more-open");
			showChrome(false);
		}
		return;
	}
	if (!chromeBuilt) buildChrome();
	showChrome(true);
}

/** A phone's words for the two tips that read differently there. */
export function touchTipBody(body: string): string
{
	return body.replace("The face map on the right shows", "The face map shows");
}

export function initTouch(): void
{
	sync();
	(query ??= matchMedia(COMPACT)).addEventListener("change", () =>
	{
		sync();
		if (mode === "play" && S) renderBoard();
	});
}
