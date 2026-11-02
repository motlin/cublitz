import {describe, expect, it} from "vite-plus/test";
import {blank} from "../../../src/core/cube.ts";
import {boxAt, cellAt, initState, parseLevel} from "../../../src/core/level.ts";
import type {LevelSource} from "../../../src/core/types.ts";

describe("parseLevel", () =>
{
	it("reads every built-in map character", () =>
	{
		const parsed = parseLevel(
			{
				map: ["S. rR", "XWZ"],
			},
		);
		expect(parsed).toStrictEqual(
			{
				map: ["S. rR", "XWZ"],
				cells: [
					[
						{
							t: "floor",
						},
						{
							t: "floor",
						},
						null,
						{
							t: "paint",
							c: "r",
						},
						{
							t: "gate",
							c: "r",
						},
					],
					[
						{
							t: "goal",
						},
						{
							t: "wgate",
							f: "b",
						},
						{
							t: "wash",
						},
					],
				],
				boxes0: [],
				switches: [],
				cols: 5,
				rows: 2,
				sx: 0,
				sy: 0,
			},
		);
	});

	it("reads each piece from the legend", () =>
	{
		const parsed = parseLevel(
			{
				map: ["S1234", "56"],
				k:
				{
					"1": ["switch", "r"],
					"2": ["button", "b"],
					"3": ["door", "w"],
					"4": ["box", "g"],
					"5": ["wgate", "t"],
					"6": ["switch", "w"],
				},
			},
		);
		expect(
			{
				cells: parsed.cells,
				boxes0: parsed.boxes0,
				switches: parsed.switches,
			},
		).toStrictEqual(
			{
				cells: [
					[
						{
							t: "floor",
						},
						{
							t: "switch",
							c: "r",
							i: 0,
						},
						{
							t: "button",
							c: "b",
						},
						{
							t: "door",
							c: "w",
						},
						{
							t: "floor",
						},
					],
					[
						{
							t: "wgate",
							f: "t",
						},
						{
							t: "switch",
							c: "w",
							i: 1,
						},
					],
				],
				boxes0: [
					{
						x: 4,
						y: 0,
						c: "g",
					},
				],
				switches: [
					{
						x: 1,
						y: 0,
						c: "r",
					},
					{
						x: 1,
						y: 1,
						c: "w",
					},
				],
			},
		);
	});

	it("lets the legend override built-in characters, but never a space", () =>
	{
		const parsed = parseLevel(
			{
				map: ["Sr "],
				k:
				{
					r: ["door", "b"],
					" ": ["door", "b"],
				},
			},
		);
		expect(parsed.cells).toStrictEqual([
			[
				{
					t: "floor",
				},
				{
					t: "door",
					c: "b",
				},
				null,
			],
		]);
	});

	it("treats any unknown character as floor", () =>
	{
		expect(
			parseLevel(
				{
					map: ["Sq?"],
				},
			).cells,
		).toStrictEqual([
			[
				{
					t: "floor",
				},
				{
					t: "floor",
				},
				{
					t: "floor",
				},
			],
		]);
	});

	it("reads all seven paints and gates", () =>
	{
		const cells = parseLevel(
			{
				map: ["rgbyopc", "RGBYOPC"],
			},
		).cells;
		expect(cells).toStrictEqual([
			Array.from("rgbyopc", (c) => (
			{
				t: "paint",
				c,
			})),
			Array.from("rgbyopc", (c) => (
			{
				t: "gate",
				c,
			})),
		]);
	});

	it("mutates and returns the object it was given, resetting earlier pieces", () =>
	{
		const source: LevelSource =
		{
			map: ["S"],
			k:
			{
				S: ["box", "r"],
			},
		};
		const parsed = parseLevel(source);
		parseLevel(source);
		expect([parsed === source, parsed.boxes0]).toStrictEqual([
			true,
			[
				{
					x: 0,
					y: 0,
					c: "r",
				},
			],
		]);
	});
});

describe("initState", () =>
{
	it("starts bare on the start tile with copied boxes and open switches off", () =>
	{
		const parsed = parseLevel(
			{
				map: [".S1", "2"],
				k:
				{
					"1": ["switch", "r"],
					"2": ["box", "w"],
				},
			},
		);
		const state = initState(parsed);
		expect(state).toStrictEqual(
			{
				x: 1,
				y: 0,
				f: blank(),
				boxes: [
					{
						x: 0,
						y: 1,
						c: "w",
					},
				],
				sw: [0],
			},
		);
		expect(state.boxes[0] === parsed.boxes0[0]).toBe(false);
	});

	it("leaves the position unset on a map with no start, as an imported level can have", () =>
	{
		expect(
			initState(
				parseLevel(
					{
						map: ["X"],
					},
				),
			),
		).toStrictEqual(
			{
				x: undefined,
				y: undefined,
				f: blank(),
				boxes: [],
				sw: [],
			},
		);
	});
});

describe("cellAt and boxAt", () =>
{
	const parsed = parseLevel(
		{
			map: ["S 1"],
			k:
			{
				"1": ["box", "r"],
			},
		},
	);

	it("returns null off the board and on holes", () =>
	{
		expect([cellAt(parsed, -1, 0), cellAt(parsed, 0, 5), cellAt(parsed, 1, 0), cellAt(parsed, 9, 0)]).toStrictEqual(
			[null, null, null, null],
		);
	});

	it("returns the cell on the board", () =>
	{
		expect(cellAt(parsed, 0, 0)).toStrictEqual(
			{
				t: "floor",
			},
		);
	});

	it("finds a box index, or -1", () =>
	{
		const state = initState(parsed);
		expect([boxAt(state, 2, 0), boxAt(state, 0, 0)]).toStrictEqual([0, -1]);
	});
});
