import {blank, DIRS, FACES, roll, workColor} from "./cube.ts";
import {boxAt, cellAt, needEntries} from "./level.ts";
import {exposedWorkColor, footprint, restsOn, rollUnits, synced, workColorOf} from "./prism.ts";
import type
{
	Box,
	ButtonCell,
	Cell,
	Direction,
	DoorCell,
	Faces,
	Level,
	LooseCube,
	MoveFailure,
	MoveResult,
	OpenColors,
	Paint,
	PieceColor,
	State,
	Unit,
} from "./types.ts";

// Which colors have their doors open right now
export function openColors(L: Level, st: State): OpenColors
{
	const open: OpenColors = {};
	L.switches.forEach((s, i) =>
	{
		if (st.sw[i]) open[s.c] = true;
	});
	const solid = workColorOf(st);
	for (const b of L.buttons) if (pressed(L, st, b.x, b.y, solid)) open[b.c] = true;
	return open;
}

/** Whether the button at x, y is held down. Callers only ask about button cells. */
export function pressed(L: Level, st: State, x: number, y: number, solid?: PieceColor | ""): boolean
{
	const c = cellAt(L, x, y) as ButtonCell;
	if (restsOn(st, x, y) && (solid ?? workColorOf(st)) === c.c) return true;
	const bi = boxAt(st, x, y);
	return bi >= 0 && st.boxes[bi]!.c === c.c;
}

/** Whether the door at x, y shows open. Callers only ask about door cells. */
export function doorOpen(L: Level, st: State, x: number, y: number, open: OpenColors): boolean
{
	const c = cellAt(L, x, y) as DoorCell;
	return open[c.c] || restsOn(st, x, y) || boxAt(st, x, y) >= 0;
}

const meetsNeed = (L: Level, f: Faces) => needEntries(L).every(([k, v]) => f[k] === v);

/**
 * Pushes box bi from x, y one cell in direction d, for a cube or block whose pieces end up as after(boxes) says: the
 * boxes once pushed, or why the push fails. taken says which cells hold something else a box can't slide onto.
 */
function pushBox(
	L: Level,
	st: State,
	bi: number,
	x: number,
	y: number,
	d: Direction,
	after: (boxes: Box[]) => State,
	taken: (x: number, y: number) => boolean = () => false,
): MoveFailure | Box[]
{
	const box = st.boxes[bi]!;
	if (workColorOf(st) !== box.c)
		return {
			ok: false,
			why: "box",
			c: box.c,
			nx: x,
			ny: y,
		};
	const [dx, dy] = DIRS[d];
	const bx = x + dx,
		by = y + dy,
		bc = cellAt(L, bx, by);
	const free = bc && !["gate", "wgate", "goal"].includes(bc.t) && boxAt(st, bx, by) < 0 && !taken(bx, by);
	if (!free)
		return {
			ok: false,
			why: "stuck",
			c: box.c,
			nx: x,
			ny: y,
		};
	const boxes = st.boxes.map((b, i) =>
		i === bi
			?
				{
					...b,
					x: bx,
					y: by,
				}
			: b,
	);
	// A door the box slides into must stay open once everything has moved
	if (bc.t === "door" && !openColors(L, after(boxes))[bc.c])
		return {
			ok: false,
			why: "door",
			c: bc.c,
			nx: bx,
			ny: by,
		};
	return boxes;
}

export function tryMove(L: Level, st: State, d: Direction): MoveResult
{
	if (st.units) return tryBlockMove(L, st, st.units, st.loose ?? [], d);
	const [dx, dy] = DIRS[d];
	const nx = st.x + dx,
		ny = st.y + dy;
	const cell = cellAt(L, nx, ny);
	if (!cell)
		return {
			ok: false,
			why: "edge",
			nx,
			ny,
		};
	let nf: Faces = roll(st.f, d);
	if (cell.t === "gate" && nf.b !== cell.c)
		return {
			ok: false,
			why: "gate",
			c: cell.c,
			down: nf.b,
			nx,
			ny,
		};
	// White gates want the named face still bare (unpainted) once you land
	if (cell.t === "wgate" && nf[cell.f])
		return {
			ok: false,
			why: "wgate",
			f: cell.f,
			has: nf[cell.f],
			nx,
			ny,
		};
	let boxes = st.boxes,
		pushed = -1;
	const bi = boxAt(st, nx, ny);
	if (bi >= 0)
	{
		const push = pushBox(L, st, bi, nx, ny, d, (moved) => (
		{
			...st,
			x: nx,
			y: ny,
			f: nf,
			boxes: moved,
		}));
		if (!Array.isArray(push)) return push;
		boxes = push;
		pushed = bi;
	}
	// Doors are judged after the move: stepping off a button lets its door shut in your face
	if (
		cell.t === "door" &&
		!openColors(
			L,
			{
				...st,
				x: nx,
				y: ny,
				f: nf,
				boxes,
			},
		)[cell.c]
	)
		return {
			ok: false,
			why: "door",
			c: cell.c,
			nx,
			ny,
		};
	let painted: Paint | null = null;
	if (cell.t === "paint")
	{
		nf =
		{
			...nf,
			b: cell.c,
		};
		painted = cell.c;
	}
	let washed = false;
	if (cell.t === "wash")
	{
		washed = FACES.some((k) => nf[k]);
		nf = blank();
	}
	let sw = st.sw,
		flipped = -1;
	if (cell.t === "switch" && workColor(nf) === cell.c)
	{
		sw = st.sw.slice();
		sw[cell.i]! ^= 1;
		flipped = cell.i;
	}
	const ns: State =
	{
		x: nx,
		y: ny,
		f: nf,
		boxes,
		sw,
	};
	const goal = cell.t === "goal";
	const won = goal && meetsNeed(L, nf);
	return {
		ok: true,
		nx,
		ny,
		st: ns,
		painted,
		washed,
		pushed,
		flipped,
		goal,
		won,
		cell,
	};
}

/** The faces of the cube a target judges: one that meets the need if any does, else the first cube on a target. */
export function judgedGoalFaces(L: Level, units: Unit[]): Faces | undefined
{
	const onGoal = units.filter((u) => u.z === 0 && cellAt(L, u.x, u.y)?.t === "goal").map((u) => u.f);
	return onGoal.find((f) => meetsNeed(L, f)) ?? onGoal[0];
}

// The rules above for any number of cubes: each cube answers for the cell under it, and a press into a loose cube
// merges it rather than rolling. tests/unit/core/merge.test.ts holds a one-cube block to exactly what tryMove does.
function tryBlockMove(L: Level, st: State, units: Unit[], loose: LooseCube[], d: Direction): MoveResult
{
	const moved = rollUnits(units, d);
	const feet = footprint(moved);
	// A block of three or more can hang its middle over a void, held up by its two ends
	const gap = feet.find((u, i) => (i === 0 || i === feet.length - 1) && !cellAt(L, u.x, u.y));
	const edge = gap ?? (feet.length < 3 ? feet.find((u) => !cellAt(L, u.x, u.y)) : undefined);
	if (edge)
		return {
			ok: false,
			why: "edge",
			nx: edge.x,
			ny: edge.y,
		};
	const standing = feet
		.map((u) => (
		{
			u,
			cell: cellAt(L, u.x, u.y),
		}))
		.filter(
			(
				foot,
			): foot is
			{
				u: Unit;
				cell: Cell;
			} => !!foot.cell,
		);
	const looseAt = (x: number, y: number) => loose.findIndex((cube) => cube.x === x && cube.y === y);
	const hit = feet.find((u) => looseAt(u.x, u.y) >= 0);
	if (hit)
	{
		if (feet.length > 1 || units.some((u) => u.z > 0))
			return {
				ok: false,
				why: "misaligned",
				nx: hit.x,
				ny: hit.y,
			};
		const i = looseAt(hit.x, hit.y),
			cube = loose[i]!;
		const st2 = synced(
			{
				...st,
				units: [
					...units,
					{
						x: cube.x,
						y: cube.y,
						z: 0,
						f: cube.f,
					},
				],
				loose: loose.filter((_, j) => j !== i),
			},
		);
		return {
			ok: true,
			nx: cube.x,
			ny: cube.y,
			st: st2,
			painted: null,
			washed: false,
			pushed: -1,
			flipped: -1,
			goal: false,
			won: false,
			cell: cellAt(L, cube.x, cube.y)!,
			merged: true,
		};
	}
	for (const {u, cell} of standing)
		if (cell.t === "gate" && u.f.b !== cell.c)
			return {
				ok: false,
				why: "gate",
				c: cell.c,
				down: u.f.b,
				nx: u.x,
				ny: u.y,
			};
	for (const {u, cell} of standing)
		if (cell.t === "wgate" && u.f[cell.f])
			return {
				ok: false,
				why: "wgate",
				f: cell.f,
				has: u.f[cell.f],
				nx: u.x,
				ny: u.y,
			};
	let boxes = st.boxes,
		pushed = -1;
	for (const {u} of standing)
	{
		const bi = boxAt(st, u.x, u.y);
		if (bi < 0) continue;
		if (moved.length > 1)
			return {
				ok: false,
				why: "heavy",
				nx: u.x,
				ny: u.y,
			};
		const push = pushBox(
			L,
			st,
			bi,
			u.x,
			u.y,
			d,
			(pushedBoxes) =>
				synced(
					{
						...st,
						units: moved,
						boxes: pushedBoxes,
					},
				),
			(x, y) => looseAt(x, y) >= 0,
		);
		if (!Array.isArray(push)) return push;
		boxes = push;
		pushed = bi;
	}
	if (standing.some(({cell}) => cell.t === "door"))
	{
		const open = openColors(
			L,
			synced(
				{
					...st,
					units: moved,
					boxes,
				},
			),
		);
		for (const {u, cell} of standing)
			if (cell.t === "door" && !open[cell.c])
				return {
					ok: false,
					why: "door",
					c: cell.c,
					nx: u.x,
					ny: u.y,
				};
	}
	let painted: Paint | null = null;
	let landed = moved.map((u) =>
	{
		const cell = standing.find((foot) => foot.u === u)?.cell;
		if (cell?.t !== "paint") return u;
		painted ??= cell.c;
		return {
			...u,
			f:
			{
				...u.f,
				b: cell.c,
			},
		};
	});
	let washed = false;
	if (standing.some(({cell}) => cell.t === "wash"))
	{
		washed = landed.some((u) => FACES.some((k) => u.f[k]));
		landed = landed.map((u) => (
		{
			...u,
			f: blank(),
		}));
	}
	const color = exposedWorkColor(landed);
	let sw = st.sw,
		flipped = -1;
	for (const {cell} of standing)
		if (cell.t === "switch" && color === cell.c)
		{
			if (sw === st.sw) sw = st.sw.slice();
			sw[cell.i]! ^= 1;
			if (flipped < 0) flipped = cell.i;
		}
	const on = (t: Cell["t"]) => standing.findIndex(({cell}) => cell.t === t);
	const goalAt = on("goal");
	const goal = goalAt >= 0;
	const goalFoot = standing[goalAt];
	// Any cube on any target can win, so a second target's cube counts even when the first's misses
	const won = standing.some(({u, cell}) => cell.t === "goal" && meetsNeed(L, landed[moved.indexOf(u)]!.f));
	const featured = goal ? goalFoot! : (standing.find(({cell}) => cell.t !== "floor") ?? standing[0]!);
	return {
		ok: true,
		nx: feet[0]!.x,
		ny: feet[0]!.y,
		st: synced(
			{
				...st,
				units: landed,
				boxes,
				sw,
			},
		),
		painted,
		washed,
		pushed,
		flipped,
		goal,
		won,
		cell: featured.cell,
	};
}

export function stateKey(st: State): string
{
	const block = st.units
		? "," +
			st.units.map((u) => [u.x, u.y, u.z, FACES.map((k) => u.f[k] || "-").join("")].join(":")).join(";") +
			"," +
			st.loose!.map((cube) => cube.x + ":" + cube.y).join(";")
		: "";
	return (
		st.x +
		"," +
		st.y +
		"," +
		FACES.map((k) => st.f[k] || "-").join("") +
		"," +
		st.boxes.map((b) => b.x + ":" + b.y).join(";") +
		"," +
		st.sw.join("") +
		block
	);
}
