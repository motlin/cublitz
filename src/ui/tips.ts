import type {Level, PieceColor} from "../core/types.ts";
import {$} from "./dom.ts";
import {loadLevel} from "./play.ts";
import {eraseProgress} from "./session.ts";
import {SFX} from "./sfx.ts";
import {clearTipsSeen, readTipsSeen, type TipsSeen, writeTipsSeen} from "./storage.ts";
import {COLORS, WGLYPH} from "./text.ts";
import {renderTitle} from "./title.ts";
import {isCompact, touchTipBody} from "./touch.ts";

// Tutorial pop-ups: shown the first time a level contains something new
type TipKey = "roll" | "paint" | "gate" | "need" | "switch" | "button" | "wgate" | "wash" | "white";
type ArtPart = [kind: string, param?: string];
type Tip = {title: string; art: (c: PieceColor) => ArtPart[]; body: string};
type QueuedTip = {key: TipKey; c: PieceColor | true | undefined};

const TIPS: Record<TipKey, Tip> = {
	roll: {
		title: "Rolling",
		art: () => [["start"], ["arrow"], ["floor"], ["arrow"], ["goal"]],
		body: "Use the arrow keys, WASD, or swipe on a phone to roll your cube one tile at a time. Each roll tips it over an edge, so a different side ends up on the floor. It can only roll onto tiles, never off the edge. Reach the glowing target to finish the level.",
	},
	paint: {
		title: "Wet paint",
		art: (c) => [["start"], ["arrow"], ["paint", c]],
		body: "When your cube rolls onto a puddle, the face touching the floor gets painted that color. The paint stays on that face until another puddle covers it. The face map on the right shows every side.",
	},
	gate: {
		title: "Color gates",
		art: (c) => [
			["gate", c],
			["gate", c],
			["gate", c],
		],
		body: "You can’t pass a colored tile until you paint your cube the same color. The face that lands on the gate has to match it, and every roll turns a different face down, so count your rolls.",
	},
	need: {
		title: "Picky targets",
		art: (c) => [["goal", c]],
		body: "A colored target only accepts your cube with that color on top. A colored bar on one edge of the target means that side of the cube needs that color too. The face map on the right shows every side of your cube.",
	},
	switch: {
		title: "Solid cubes and switches",
		art: (c) => [["solid", c], ["arrow"], ["switch", c], ["arrow"], ["door", c]],
		body: "Switches only work for a cube painted completely in their color, all six faces. Once your cube is solid it glows. Roll it onto a switch of the same color to flip it, and every door of that color opens.",
	},
	wgate: {
		title: "White gates",
		art: () => [
			["wgate", "b"],
			["wgate", "n"],
			["wgate", "t"],
		],
		body: "White gates want a bare, unpainted side. A plain one needs a bare face down. One with an arrow needs the side it points to still bare when you land, and one with a ring needs a bare top. Paint stays on until a paint remover wipes it, so every puddle you cross uses up a white face. A solid cube can never get through.",
	},
	wash: {
		title: "Paint remover",
		art: (c) => [["solid", c || "r"], ["arrow"], ["wash"], ["arrow"], ["start"]],
		body: "Roll onto a paint remover and every face of your cube is wiped back to bare, all at once. Use it when puddles or a solid coat have used up the bare sides a white gate needs. It also ends a solid coat, so finish with switches and boxes first.",
	},
	white: {
		title: "White pieces",
		art: () => [["start"], ["arrow"], ["switch", "w"], ["box", "w"], ["door", "w"]],
		body: "A cube with no paint on any face counts as white. It doesn’t glow or act like a solid cube, but it can flip white switches, hold down white buttons and push white boxes. If you pick up paint, a paint remover makes you white again.",
	},
	button: {
		title: "Buttons and boxes",
		art: (c) => [["solid", c], ["box", c], ["arrow"], ["button", c]],
		body: "A button holds its doors open only while something of its color sits on it. If you step off, the door shuts. A solid cube can push a box of its own color, and a box left on the button keeps the door open for good.",
	},
};
const TIP_ORDER: TipKey[] = ["roll", "paint", "gate", "need", "switch", "button", "wgate", "wash", "white"];
let tipsSeen: TipsSeen = {};
let tipQueue: QueuedTip[] = [];
let tipTotal = 0;
let resetTimer: ReturnType<typeof setTimeout> | null = null;

export function levelTips(L: Level): QueuedTip[] {
	const found: Partial<Record<TipKey, PieceColor | true>> = {};
	for (let y = 0; y < L.rows; y++)
		for (let x = 0; x < L.cols; x++) {
			const c = L.cells[y]![x];
			if (!c) continue;
			if (c.t === "paint") found.paint = found.paint || c.c;
			if (c.t === "gate") found.gate = found.gate || c.c;
			if (c.t === "wgate") found.wgate = true;
			if (c.t === "wash") found.wash = found.paint || "r";
			if ((c.t === "switch" || c.t === "button" || c.t === "door") && c.c === "w") {
				found.white = true;
				continue;
			}
			if (c.t === "switch") found.switch = found.switch || c.c;
			if (c.t === "button") found.button = found.button || c.c;
		}
	L.boxes0.forEach((b) => {
		if (b.c === "w") found.white = true;
		else found.button = found.button || b.c;
	});
	if (L.need) found.need = Object.values(L.need)[0]!;
	found.roll = true;
	return TIP_ORDER.filter((k) => found[k]).map((k) => ({key: k, c: found[k]}));
}
export function queueTips(L: Level, all?: boolean): void {
	tipQueue = levelTips(L).filter((t) => all || !tipsSeen[t.key]);
	tipTotal = tipQueue.length;
	showNextTip();
}
export const clearTipQueue = (): void => {
	tipQueue = [];
};
export function tipArt(parts: ArtPart[]): string {
	return parts
		.map(([kind, c]) => {
			if (kind === "arrow") return '<span class="tip-arrow">→</span>';
			if (kind === "solid") return `<span class="tip-cube" style="--pc:${COLORS[c as PieceColor]}"></span>`;
			if (kind === "start") return '<span class="tip-cube bare"></span>';
			if (kind === "wash") return '<span class="ec wash" style="--ec:44px"><b>✦</b></span>';
			if (kind === "wgate")
				return `<span class="ec wgate wg-${c}" style="--ec:44px">${WGLYPH[c!] ? `<b>${WGLYPH[c!]}</b>` : ""}</span>`;
			return `<span class="ec ${kind}" style="--ec:44px${c ? `;--pc:${COLORS[c as PieceColor]}` : ""}"></span>`;
		})
		.join("");
}
function showNextTip(): void {
	const t = tipQueue[0];
	if (!t) {
		$("tip").hidden = true;
		return;
	}
	SFX.play("tip");
	const T = TIPS[t.key];
	$("tipTitle").textContent = T.title;
	$("tipBody").textContent = isCompact() ? touchTipBody(t.key, T.body) : T.body;
	$("tipArt").innerHTML = tipArt(T.art(t.c as PieceColor));
	$("tipCount").textContent = tipTotal > 1 ? `New · ${tipTotal - tipQueue.length + 1} of ${tipTotal}` : "New";
	$("tipOk").textContent = tipQueue.length > 1 ? "Next" : "Got it";
	$("tip").hidden = false;
	$("tipOk").focus({preventScroll: true});
}
export function dismissTip(): void {
	const t = tipQueue.shift();
	if (t) {
		tipsSeen[t.key] = true;
		writeTipsSeen(tipsSeen);
	}
	showNextTip();
	if ($("tip").hidden) $("viewport").focus?.({preventScroll: true});
}
export const tipOpen = (): boolean => !$("tip").hidden;

export function initTips(): void {
	tipsSeen = readTipsSeen();
	$("tipOk").addEventListener("click", dismissTip);
	$("resetProgress").addEventListener("click", () => {
		const b = $("resetProgress");
		if (!b.classList.contains("armed")) {
			b.classList.add("armed");
			b.textContent = "Click again to erase all progress";
			$("resetNote").hidden = false;
			$("resetNote").textContent =
				"This locks every level after the first, clears your best scores and brings back the tutorial pop-ups. Your colors and saved editor levels stay.";
			clearTimeout(resetTimer!);
			resetTimer = setTimeout(() => {
				b.classList.remove("armed");
				b.textContent = "Reset all progress";
				$("resetNote").hidden = true;
			}, 5000);
			return;
		}
		clearTimeout(resetTimer!);
		eraseProgress();
		tipsSeen = {};
		clearTipsSeen();
		b.classList.remove("armed");
		b.textContent = "Reset all progress";
		$("resetNote").hidden = false;
		$("resetNote").textContent = "Progress erased. Every level after the first is locked again.";
		setTimeout(() => {
			$("resetNote").hidden = true;
		}, 3000);
		loadLevel(0);
		renderTitle();
	});
	$("tipsReplay").addEventListener("click", () => {
		tipsSeen = {};
		clearTipsSeen();
		$("resetNote").hidden = false;
		$("resetNote").textContent = "The tutorial pop-ups will show again as you reach each new thing.";
		setTimeout(() => {
			$("resetNote").hidden = true;
		}, 3000);
	});
}
