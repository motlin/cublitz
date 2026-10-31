import {expect, test} from "vite-plus/test";
import {parseLevel} from "../../../src/core/level.ts";
import {blankGrid, draftFromLevel, edCellHTML, edToLevel, newEditor} from "../../../src/ui/editor-grid.ts";
import type {EditorDraft} from "../../../src/ui/storage.ts";

const draft = (grid: EditorDraft["grid"], over: Partial<EditorDraft> = {}): EditorDraft => ({
	id: null,
	name: "Mine",
	cols: grid[0]!.length,
	rows: grid.length,
	grid,
	need: {},
	...over,
});

test("a new editor is a blank 8 by 5 grid with a start and a target", () => {
	const floor = {t: "floor"};
	expect(newEditor()).toStrictEqual({
		id: null,
		name: "Untitled",
		cols: 8,
		rows: 5,
		grid: [
			Array(8).fill(floor),
			Array(8).fill(floor),
			[{t: "start"}, ...Array(6).fill(floor), {t: "goal"}],
			Array(8).fill(floor),
			Array(8).fill(floor),
		],
		need: {},
	});
	expect(blankGrid(1, 2)).toStrictEqual([[floor], [floor]]);
});

test("the grid becomes map characters, with legend entries handed out in reading order", () => {
	const grid: EditorDraft["grid"] = [
		[{t: "start"}, {t: "floor"}, {t: "paint", c: "r"}, {t: "gate", c: "b"}, {t: "wgate", f: "b"}, {t: "wash"}],
		[{t: "wgate", f: "n"}, {t: "switch", c: "w"}, {t: "box", c: "g"}, {t: "switch", c: "w"}, {t: "goal"}, null],
	];
	expect(edToLevel(draft(grid, {name: "  Spaced  ", need: {b: "r", t: "g"}}))).toStrictEqual({
		level: {
			name: "Spaced",
			map: ["S.rBWZ", "123" + "2X"],
			k: {1: ["wgate", "n"], 2: ["switch", "w"], 3: ["box", "g"]},
			need: {t: "g", b: "r"},
		},
	});
});

test("trailing empty cells are trimmed, and a blank name becomes Untitled", () => {
	expect(edToLevel(draft([[{t: "start"}, {t: "goal"}, null, null]], {name: "   "}))).toStrictEqual({
		level: {name: "Untitled", map: ["SX"], k: {}},
	});
});

test("starts and targets are counted", () => {
	const goal = {t: "goal"} as const,
		start = {t: "start"} as const;
	expect([
		edToLevel(draft([[goal]])),
		edToLevel(draft([[start, start, goal]])),
		edToLevel(draft([[start]])),
	]).toStrictEqual([
		{error: "Place a start tile."},
		{error: "Place only one start."},
		{error: "Place at least one target."},
	]);
});

test("a level comes back as a grid, with its start and boxes as cells", () => {
	const source = {
		map: ["S.1", "r2X", "Z W"],
		k: {1: ["box", "r"], 2: ["wgate", "t"]},
		need: {t: "b"},
	} as Parameters<typeof draftFromLevel>[0];
	const expected = draftFromLevel(source, "Copy", "L1");
	expect(JSON.parse(JSON.stringify(expected))).toStrictEqual({
		id: "L1",
		name: "Copy",
		cols: 3,
		rows: 3,
		grid: [
			[{t: "start"}, {t: "floor"}, {t: "box", c: "r"}],
			[{t: "paint", c: "r"}, {t: "wgate", f: "t"}, {t: "goal"}],
			[{t: "wash"}, null, {t: "wgate", f: "b"}],
		],
		need: {t: "b"},
	});
	expect(source).toStrictEqual({
		map: ["S.1", "r2X", "Z W"],
		k: {1: ["box", "r"], 2: ["wgate", "t"]},
		need: {t: "b"},
	});
	expect(parseLevel(edToLevel(expected).level!).rows).toBe(3);
});

test("cells render as the original markup", () => {
	expect([
		edCellHTML(null, {}),
		edCellHTML({t: "wash"}, {}),
		edCellHTML({t: "wgate", f: "b"}, {}),
		edCellHTML({t: "wgate", f: "n"}, {}),
		edCellHTML({t: "floor"}, {t: "r"}),
		edCellHTML({t: "goal"}, {}),
		edCellHTML({t: "goal"}, {t: "r"}),
		edCellHTML({t: "door", c: "w"}, {}),
	]).toStrictEqual([
		'<div class="ec void"></div>',
		'<div class="ec wash"><b>✦</b></div>',
		'<div class="ec wgate wg-b"></div>',
		'<div class="ec wgate wg-n"><b>↑</b></div>',
		'<div class="ec floor"></div>',
		'<div class="ec goal"></div>',
		'<div class="ec goal" style="--pc:var(--red)"></div>',
		'<div class="ec door" style="--pc:var(--clay)"></div>',
	]);
});
