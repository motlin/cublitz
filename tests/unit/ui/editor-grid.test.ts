import {expect, test} from "vite-plus/test";
import {parseLevel} from "../../../src/core/level.ts";
import
{
	blankGrid,
	draftFromLevel,
	edCellHTML,
	edToLevel,
	LOOSE_CUBE_STYLE,
	newEditor,
} from "../../../src/ui/editor-grid.ts";
import type {EditorDraft} from "../../../src/ui/storage.ts";

const draft = (grid: EditorDraft["grid"], over: Partial<EditorDraft> = {}): EditorDraft => (
{
	id: null,
	name: "Mine",
	cols: grid[0]!.length,
	rows: grid.length,
	grid,
	need: {},
	...over,
});

test("a new editor is a blank 8 by 5 grid with a start and a target", () =>
{
	const floor =
	{
		t: "floor",
	};
	expect(newEditor()).toStrictEqual(
		{
			id: null,
			name: "Untitled",
			cols: 8,
			rows: 5,
			grid: [
				Array.from(
					{
						length: 8,
					},
					() => floor,
				),
				Array.from(
					{
						length: 8,
					},
					() => floor,
				),
				[
					{
						t: "start",
					},
					...Array.from(
						{
							length: 6,
						},
						() => floor,
					),
					{
						t: "goal",
					},
				],
				Array.from(
					{
						length: 8,
					},
					() => floor,
				),
				Array.from(
					{
						length: 8,
					},
					() => floor,
				),
			],
			need: {},
		},
	);
	expect(blankGrid(1, 2)).toStrictEqual([[floor], [floor]]);
});

test("the grid becomes map characters, with legend entries handed out in reading order", () =>
{
	const grid: EditorDraft["grid"] = [
		[
			{
				t: "start",
			},
			{
				t: "floor",
			},
			{
				t: "paint",
				c: "r",
			},
			{
				t: "gate",
				c: "b",
			},
			{
				t: "wgate",
				f: "b",
			},
			{
				t: "wash",
			},
		],
		[
			{
				t: "wgate",
				f: "n",
			},
			{
				t: "switch",
				c: "w",
			},
			{
				t: "box",
				c: "g",
			},
			{
				t: "switch",
				c: "w",
			},
			{
				t: "goal",
			},
			null,
		],
	];
	expect(
		edToLevel(
			draft(
				grid,
				{
					name: "  Spaced  ",
					need:
					{
						b: "r",
						t: "g",
					},
				},
			),
		),
	).toStrictEqual(
		{
			level:
			{
				name: "Spaced",
				map: ["S.rBWZ", "1232X"],
				k:
				{
					1: ["wgate", "n"],
					2: ["switch", "w"],
					3: ["box", "g"],
				},
				need:
				{
					t: "g",
					b: "r",
				},
			},
		},
	);
});

test("every distinct piece the editor can make gets its own legend character", () =>
{
	const pieces: EditorDraft["grid"][number] = [
		...(["t", "n", "s", "e", "w"] as const).map((f) => (
		{
			t: "wgate" as const,
			f,
		})),
		{
			t: "cube",
		},
		...(["switch", "button", "box", "door"] as const).flatMap((t) =>
			(["r", "o", "y", "g", "c", "b", "p", "w"] as const).map((c) => (
			{
				t,
				c,
			})),
		),
	];
	const {level} = edToLevel(
		draft([
			[
				{
					t: "start",
				},
				{
					t: "goal",
				},
			],
			pieces.slice(0, 19),
			pieces.slice(19),
		]),
	);
	expect(
		{
			kinds: pieces.length,
			legend: Object.keys(level!.k!).length,
			widths: level!.map.map((row) => Array.from(row).length),
		},
	).toStrictEqual(
		{
			kinds: 38,
			legend: 38,
			widths: [2, 19, 19],
		},
	);
});

test("trailing empty cells are trimmed, and a blank name becomes Untitled", () =>
{
	expect(
		edToLevel(
			draft(
				[
					[
						{
							t: "start",
						},
						{
							t: "goal",
						},
						null,
						null,
					],
				],
				{
					name: "   ",
				},
			),
		),
	).toStrictEqual(
		{
			level:
			{
				name: "Untitled",
				map: ["SX"],
				k: {},
			},
		},
	);
});

test("starts and targets are counted", () =>
{
	const goal =
		{
			t: "goal",
		} as const,
		start =
		{
			t: "start",
		} as const;
	expect([
		edToLevel(draft([[goal]])),
		edToLevel(draft([[start, start, goal]])),
		edToLevel(draft([[start]])),
	]).toStrictEqual([
		{
			error: "Place a start tile.",
		},
		{
			error: "Place only one start.",
		},
		{
			error: "Place at least one target.",
		},
	]);
});

test("a level comes back as a grid, with its start and boxes as cells", () =>
{
	const source =
	{
		map: ["S.1", "r2X", "Z W"],
		k:
		{
			1: ["box", "r"],
			2: ["wgate", "t"],
		},
		need:
		{
			t: "b",
		},
	} as Parameters<typeof draftFromLevel>[0];
	const expected = draftFromLevel(source, "Copy", "L1");
	expect(JSON.parse(JSON.stringify(expected))).toStrictEqual(
		{
			id: "L1",
			name: "Copy",
			cols: 3,
			rows: 3,
			grid: [
				[
					{
						t: "start",
					},
					{
						t: "floor",
					},
					{
						t: "box",
						c: "r",
					},
				],
				[
					{
						t: "paint",
						c: "r",
					},
					{
						t: "wgate",
						f: "t",
					},
					{
						t: "goal",
					},
				],
				[
					{
						t: "wash",
					},
					null,
					{
						t: "wgate",
						f: "b",
					},
				],
			],
			need:
			{
				t: "b",
			},
		},
	);
	expect(source).toStrictEqual(
		{
			map: ["S.1", "r2X", "Z W"],
			k:
			{
				1: ["box", "r"],
				2: ["wgate", "t"],
			},
			need:
			{
				t: "b",
			},
		},
	);
	expect(parseLevel(edToLevel(expected).level!).rows).toBe(3);
});

test("a loose cube becomes one legend entry, however many cubes share it", () =>
{
	const grid: EditorDraft["grid"] = [
		[
			{
				t: "start",
			},
			{
				t: "cube",
			},
			{
				t: "floor",
			},
			{
				t: "cube",
			},
			{
				t: "goal",
			},
		],
	];
	expect(edToLevel(draft(grid))).toStrictEqual(
		{
			level:
			{
				name: "Mine",
				map: ["S1.1X"],
				k:
				{
					1: ["cube", "w"],
				},
			},
		},
	);
});

test("a level's loose cubes come back as cells and survive the round trip", () =>
{
	const source =
	{
		name: "Stick Together",
		map: ["S+.X"],
		k:
		{
			"+": ["cube", "w"],
		},
	} as Parameters<typeof draftFromLevel>[0];
	const copy = draftFromLevel(source, "Copy", null);
	expect(JSON.parse(JSON.stringify(copy))).toStrictEqual(
		{
			id: null,
			name: "Copy",
			cols: 4,
			rows: 1,
			grid: [
				[
					{
						t: "start",
					},
					{
						t: "cube",
					},
					{
						t: "floor",
					},
					{
						t: "goal",
					},
				],
			],
			need: {},
		},
	);
	expect(edToLevel(copy)).toStrictEqual(
		{
			level:
			{
				name: "Copy",
				map: ["S1.X"],
				k:
				{
					1: ["cube", "w"],
				},
			},
		},
	);
	expect(parseLevel(edToLevel(copy).level!).cubes0).toStrictEqual([
		{
			x: 1,
			y: 0,
		},
	]);
});

test("a loose cube's cell is drawn in its own class, which the board's .cube rules can't reach", () =>
{
	expect(
		edCellHTML(
			{
				t: "cube",
			},
			{},
		),
	).toBe(`<div class="ec loose" style="${LOOSE_CUBE_STYLE}"></div>`);
});

test("cells render as the original markup", () =>
{
	expect([
		edCellHTML(null, {}),
		edCellHTML(
			{
				t: "wash",
			},
			{},
		),
		edCellHTML(
			{
				t: "wgate",
				f: "b",
			},
			{},
		),
		edCellHTML(
			{
				t: "wgate",
				f: "n",
			},
			{},
		),
		edCellHTML(
			{
				t: "floor",
			},
			{
				t: "r",
			},
		),
		edCellHTML(
			{
				t: "goal",
			},
			{},
		),
		edCellHTML(
			{
				t: "goal",
			},
			{
				t: "r",
			},
		),
		edCellHTML(
			{
				t: "door",
				c: "w",
			},
			{},
		),
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
