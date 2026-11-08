import {expect, test} from "vite-plus/test";
import {parseLevel} from "../../../src/core/level.ts";
import {LEVELS} from "../../../src/core/levels.ts";
import type {LevelSource} from "../../../src/core/types.ts";
import {KEYMAP, swipeDirection} from "../../../src/ui/input.ts";
import {toHex, toRGB} from "../../../src/ui/palette.ts";
import {cap, esc} from "../../../src/ui/text.ts";
import {levelTips, tipArt} from "../../../src/ui/tips.ts";

test("cap and esc", () =>
{
	expect([cap("red"), esc(`<a b="c">&'`), esc(undefined), esc(5)]).toStrictEqual([
		"Red",
		"&lt;a b=&quot;c&quot;&gt;&amp;'",
		"undefined",
		"5",
	]);
});

test("colors convert to channels and back, clamped and rounded", () =>
{
	expect([toRGB("#0a10ff"), toRGB("#zz0000"), toHex([10, 16, 255]), toHex([-5, 300, 1.5])]).toStrictEqual([
		[10, 16, 255],
		[NaN, 0, 0],
		"#0a10ff",
		"#00ff02",
	]);
});

test("swipes need 24 pixels and follow the longer axis, with ties going vertical", () =>
{
	expect([
		swipeDirection(23, -23),
		swipeDirection(24, 0),
		swipeDirection(-24, 3),
		swipeDirection(3, 24),
		swipeDirection(3, -24),
		swipeDirection(30, 30),
		swipeDirection(30, -30),
	]).toStrictEqual([null, "E", "W", "S", "N", "S", "N"]);
});

test("arrows and WASD in either case roll, and nothing else does", () =>
{
	expect(KEYMAP).toStrictEqual(
		{
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
		},
	);
});

const tipsOf = (source: LevelSource) => levelTips(parseLevel(source));

test("a level's tips come in tutorial order, each with the first color that needs it", () =>
{
	expect(
		tipsOf(
			{
				map: ["Sg.bRW", "Z1234", "5X"],
				k:
				{
					1: ["switch", "y"],
					2: ["button", "c"],
					3: ["door", "w"],
					4: ["box", "p"],
					5: ["wgate", "n"],
				},
				need:
				{
					t: "o",
				},
			},
		),
	).toStrictEqual([
		{
			key: "roll",
			c: true,
		},
		{
			key: "paint",
			c: "g",
		},
		{
			key: "gate",
			c: "r",
		},
		{
			key: "need",
			c: "o",
		},
		{
			key: "switch",
			c: "y",
		},
		{
			key: "button",
			c: "c",
		},
		{
			key: "wgate",
			c: true,
		},
		{
			key: "wash",
			c: "g",
		},
		{
			key: "white",
			c: true,
		},
	]);
	expect(
		tipsOf(
			{
				map: ["SX"],
			},
		),
	).toStrictEqual([
		{
			key: "roll",
			c: true,
		},
	]);
});

test("a white piece teaches white pieces and not its own kind", () =>
{
	expect(
		tipsOf(
			{
				map: ["S123X"],
				k:
				{
					1: ["switch", "w"],
					2: ["button", "w"],
					3: ["box", "w"],
				},
			},
		),
	).toStrictEqual([
		{
			key: "roll",
			c: true,
		},
		{
			key: "white",
			c: true,
		},
	]);
});

test("tip art renders as the original markup", () =>
{
	expect(
		tipArt([
			["arrow"],
			["solid", "r"],
			["start"],
			["wash"],
			["wgate", "b"],
			["wgate", "t"],
			["goal"],
			["paint", "b"],
		]),
	).toBe(
		'<span class="tip-arrow">→</span><span class="tip-cube" style="--pc:var(--red)"></span><span class="tip-cube bare"></span><span class="ec wash" style="--ec:44px"><b>✦</b></span><span class="ec wgate wg-b" style="--ec:44px"></span><span class="ec wgate wg-t" style="--ec:44px"><b>◉</b></span><span class="ec goal" style="--ec:44px"></span><span class="ec paint" style="--ec:44px;--pc:var(--blue)"></span>',
	);
});

const CAMPAIGN_TIPS = [
	["First Roll", ["roll true"]],
	["First Coat", ["roll true", "paint r", "gate r"]],
	["Blue Fence", ["roll true", "paint b", "gate b"]],
	["Keep the Red", ["roll true", "paint r", "gate r"]],
	["Crown", ["roll true", "paint y", "gate y", "need y"]],
	["Checkpoints", ["roll true", "paint g", "gate r"]],
	["Stripes", ["roll true", "paint r", "gate r"]],
	["Prism", ["roll true", "paint r", "gate r", "need g"]],
	["Full Dip", ["roll true", "paint r", "switch r"]],
	["Box Step", ["roll true", "paint b", "button b"]],
	["Two Tone", ["roll true", "paint y", "switch y", "button g"]],
	["Compass", ["roll true", "paint r", "need r"]],
	["Lockstep", ["roll true", "paint g", "gate r", "need g", "switch g"]],
	["Relay", ["roll true", "paint r", "switch r", "button b"]],
	["Two Rooms", ["roll true", "paint r", "button r"]],
	["Masterpiece", ["roll true", "paint y", "gate y", "need b", "button g"]],
	["Ladder", ["roll true", "paint o", "gate o"]],
	["Spectrum", ["roll true", "paint o", "need c"]],
	["Violet Vault", ["roll true", "paint o", "gate o", "need o", "button p"]],
	["Kaleidoscope", ["roll true", "paint c", "need p", "switch c", "button o"]],
	["Blank Slate", ["roll true", "paint r", "wgate true"]],
	["Eastern Window", ["roll true", "paint b", "wgate true"]],
	["Two Sides", ["roll true", "paint g", "wgate true"]],
	["Long Hall", ["roll true", "paint p", "wgate true"]],
	["Last White", ["roll true", "paint o", "wgate true"]],
	["Fresh Start", ["roll true", "paint r", "switch r", "wgate true", "wash r"]],
	["Second Coat", ["roll true", "paint r", "wgate true", "wash r"]],
	["Bare Hands", ["roll true", "paint r", "wash r", "white true"]],
	["Clean Push", ["roll true", "paint r", "gate r", "wash r", "white true"]],
	["Clean Sweep", ["roll true", "paint o", "switch o", "wash o", "white true"]],
	["Stinkley tinkles", ["roll true", "paint r", "switch r", "button c", "wash r", "white true"]],
];

// A fresh save sees every tip a level teaches when it first opens.
test("each campaign level teaches its own tips, in tutorial order", () =>
{
	expect(LEVELS.map((level) => [level.name, levelTips(level).map(({key, c}) => `${key} ${c}`)])).toStrictEqual(
		CAMPAIGN_TIPS,
	);
});
