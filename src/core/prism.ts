import {FACES, roll, workColor} from "./cube.ts";
import type {Direction, Face, LooseCube, Paint, PieceColor, State, Unit} from "./types.ts";

const FACE_OFFSET: Record<Face, [number, number, number]> =
{
	t: [0, 0, 1],
	b: [0, 0, -1],
	n: [0, -1, 0],
	s: [0, 1, 0],
	e: [1, 0, 0],
	w: [-1, 0, 0],
};

/** The state with its player as a one-cube block. */
export function withUnits(st: State, loose: LooseCube[] = []): State
{
	return {
		...st,
		units: [
			{
				x: st.x,
				y: st.y,
				z: 0,
				f: st.f,
			},
		],
		loose,
	};
}

/** The state with x, y and f brought in line with its first unit. */
export function synced(st: State): State
{
	const first = st.units![0]!;
	return {
		x: first.x,
		y: first.y,
		f: first.f,
		boxes: st.boxes,
		sw: st.sw,
		units: st.units!,
		loose: st.loose!,
	};
}

/** Tips the whole block over the bottom edge on side d, turning each cube's faces with it. */
export function rollUnits(units: Unit[], d: Direction): Unit[]
{
	const xs = units.map((u) => u.x),
		ys = units.map((u) => u.y);
	const east = Math.max(...xs) + 1,
		west = Math.min(...xs),
		south = Math.max(...ys) + 1,
		north = Math.min(...ys);
	return units.map((u) =>
	{
		const f = roll(u.f, d);
		if (d === "E")
			return {
				x: east + u.z,
				y: u.y,
				z: east - u.x - 1,
				f,
			};
		if (d === "W")
			return {
				x: west - 1 - u.z,
				y: u.y,
				z: u.x - west,
				f,
			};
		if (d === "S")
			return {
				x: u.x,
				y: south + u.z,
				z: south - u.y - 1,
				f,
			};
		return {
			x: u.x,
			y: north - 1 - u.z,
			z: u.y - north,
			f,
		};
	});
}

/** The cubes touching the floor, in order along the block. */
export const footprint = (units: Unit[]): Unit[] =>
	units.filter((u) => u.z === 0).sort((a, b) => a.x + a.y - (b.x + b.y));

/** The cells a roll that way would put the block's floor cubes on, in order along the block. */
export const landingTiles = (st: State, d: Direction): [number, number][] =>
	footprint(rollUnits(st.units ?? withUnits(st).units!, d)).map((u) => [u.x, u.y]);

export const restsOn = (st: State, x: number, y: number): boolean =>
	st.units ? st.units.some((u) => u.z === 0 && u.x === x && u.y === y) : st.x === x && st.y === y;

/**
 * The color a block can work pieces of: as workColor, reading only the faces on its outside, because the faces cubes
 * press together can never reach a puddle.
 */
export function exposedWorkColor(units: readonly Unit[]): PieceColor | ""
{
	const outside = units.flatMap((u) =>
		FACES.filter((k) =>
		{
			const [dx, dy, dz] = FACE_OFFSET[k];
			return !units.some((o) => o.x === u.x + dx && o.y === u.y + dy && o.z === u.z + dz);
		}).map((k) => u.f[k]),
	);
	const first = outside[0] ?? "";
	return outside.every((c) => c === first) ? first || "w" : "";
}

export const workColorOf = (st: State): PieceColor | "" => (st.units ? exposedWorkColor(st.units) : workColor(st.f));

/** The paint covering all of the outside of the block or cube, or '' while nothing does. */
export function solidColorOf(st: State): Paint | ""
{
	const c = workColorOf(st);
	return c === "w" ? "" : c;
}
