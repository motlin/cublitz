import {blank} from "./cube.ts";
import {withUnits} from "./prism.ts";
import type {Box, Cell, Face, Level, LevelSource, Paint, State} from "./types.ts";

// Map chars: ' ' void, '.' floor, 'S' start, 'X' target, lowercase color letter = puddle, uppercase = gate.
export const PAINTS = "rgbyopc";
const isPaint = (ch: string): ch is Paint => PAINTS.includes(ch);
const isGate = (ch: string): boolean => PAINTS.toUpperCase().includes(ch);

// Extra pieces come from the level's legend k: { char: [kind, color] }, kind in switch|button|box|door.
export function parseLevel<T extends LevelSource>(source: T): T & Level
{
	// parseLevel completes its argument in place: campaign levels and callers keep the same object.
	const L = source as T & Level;
	L.cells = [];
	L.boxes0 = [];
	L.switches = [];
	L.cols = Math.max(...L.map.map((r) => Array.from(r).length));
	L.rows = L.map.length;
	L.map.forEach((row, y) =>
	{
		L.cells[y] = [];
		Array.from(row).forEach((ch, x) =>
		{
			let cell: Cell | null = null;
			const k = L.k?.[ch];
			if (ch === " ") cell = null;
			else if (k)
			{
				const [kind, c] = k;
				if (kind === "wgate")
					cell =
					{
						t: "wgate",
						f: c,
					};
				else if (kind === "cube")
				{
					cell =
					{
						t: "floor",
					};
					(L.cubes0 ||= []).push(
						{
							x,
							y,
						},
					);
				}
				else if (kind === "box")
				{
					cell =
					{
						t: "floor",
					};
					L.boxes0.push(
						{
							x,
							y,
							c,
						},
					);
				}
				else if (kind === "switch")
				{
					cell =
					{
						t: kind,
						c,
						i: L.switches.length,
					};
					L.switches.push(
						{
							x,
							y,
							c,
						},
					);
				}
				else
					cell =
					{
						t: kind,
						c,
					};
			}
			else if (ch === "S")
			{
				cell =
				{
					t: "floor",
				};
				L.sx = x;
				L.sy = y;
			}
			else if (ch === "X")
				cell =
				{
					t: "goal",
				};
			else if (ch === "W")
				cell =
				{
					t: "wgate",
					f: "b",
				};
			else if (ch === "Z")
				cell =
				{
					t: "wash",
				};
			else if (isPaint(ch))
				cell =
				{
					t: "paint",
					c: ch,
				};
			else if (isGate(ch))
				cell =
				{
					t: "gate",
					c: ch.toLowerCase() as Paint,
				};
			else
				cell =
				{
					t: "floor",
				};
			L.cells[y]![x] = cell;
		});
	});
	return L;
}

export function initState(L: Level): State
{
	const st: State =
	{
		x: L.sx,
		y: L.sy,
		f: blank(),
		boxes: L.boxes0.map((b) => (
		{
			...b,
		})),
		sw: L.switches.map(() => 0),
	};
	return L.cubes0
		? withUnits(
				st,
				L.cubes0.map((cube) => (
				{
					...cube,
					f: blank(),
				})),
			)
		: st;
}

export const cellAt = (L: Level, x: number, y: number): Cell | null => (L.cells[y] || [])[x] || null;
export const boxAt = (
	st:
	{
		boxes: Box[];
	},
	x: number,
	y: number,
): number => st.boxes.findIndex((b) => b.x === x && b.y === y);

/** A level's needs as entries; JSON keys come back as strings, and only face names are ever stored. */
export const needEntries = (L: LevelSource): [Face, Paint][] => Object.entries(L.need || {}) as [Face, Paint][];
