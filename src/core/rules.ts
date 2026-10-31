import {blank, DIRS, FACES, roll, workColor} from "./cube.ts";
import {boxAt, cellAt, needEntries} from "./level.ts";
import type {ButtonCell, Direction, DoorCell, Faces, Level, MoveResult, OpenColors, Paint, PieceColor, State} from "./types.ts";

// Which colors have their doors open right now
export function openColors(L: Level, st: State): OpenColors {
	const open: OpenColors = {};
	L.switches.forEach((s, i) => {
		if (st.sw[i]) open[s.c] = true;
	});
	const solid = workColor(st.f);
	for (let y = 0; y < L.rows; y++)
		for (let x = 0; x < L.cols; x++) {
			const c = cellAt(L, x, y);
			if (!c || c.t !== "button") continue;
			if (pressed(L, st, x, y, solid)) open[c.c] = true;
		}
	return open;
}

/** Whether the button at x, y is held down. Callers only ask about button cells. */
export function pressed(L: Level, st: State, x: number, y: number, solid?: PieceColor | ""): boolean {
	const c = cellAt(L, x, y) as ButtonCell;
	if (st.x === x && st.y === y && (solid ?? workColor(st.f)) === c.c) return true;
	const bi = boxAt(st, x, y);
	return bi >= 0 && st.boxes[bi]!.c === c.c;
}

/** Whether the door at x, y shows open. Callers only ask about door cells. */
export function doorOpen(L: Level, st: State, x: number, y: number, open: OpenColors): boolean {
	const c = cellAt(L, x, y) as DoorCell;
	return open[c.c] || (st.x === x && st.y === y) || boxAt(st, x, y) >= 0;
}

export function tryMove(L: Level, st: State, d: Direction): MoveResult {
	const [dx, dy] = DIRS[d];
	const nx = st.x + dx,
		ny = st.y + dy;
	const cell = cellAt(L, nx, ny);
	if (!cell) return {ok: false, why: "edge", nx, ny};
	// The original computes this here and never reads it. It is kept so the code moves without changes.
	openColors(L, st);
	let nf: Faces = roll(st.f, d);
	if (cell.t === "gate" && nf.b !== cell.c) return {ok: false, why: "gate", c: cell.c, down: nf.b, nx, ny};
	// White gates want the named face still bare (unpainted) once you land
	if (cell.t === "wgate" && nf[cell.f]) return {ok: false, why: "wgate", f: cell.f, has: nf[cell.f], nx, ny};
	let boxes = st.boxes,
		pushed = -1;
	const bi = boxAt(st, nx, ny);
	if (bi >= 0) {
		const box = st.boxes[bi]!;
		if (workColor(st.f) !== box.c) return {ok: false, why: "box", c: box.c, nx, ny};
		const bx = nx + dx,
			by = ny + dy,
			bc = cellAt(L, bx, by);
		const free = bc && !["gate", "wgate", "goal"].includes(bc.t) && boxAt(st, bx, by) < 0;
		if (!free) return {ok: false, why: "stuck", c: box.c, nx, ny};
		boxes = st.boxes.map((b, i) => (i === bi ? {...b, x: bx, y: by} : b));
		pushed = bi;
		// A door the box slides into must stay open once everything has moved
		if (bc.t === "door" && !openColors(L, {...st, x: nx, y: ny, f: nf, boxes})[bc.c]) return {ok: false, why: "door", c: bc.c, nx: bx, ny: by};
	}
	// Doors are judged after the move: stepping off a button lets its door shut in your face
	if (cell.t === "door" && !openColors(L, {...st, x: nx, y: ny, f: nf, boxes})[cell.c]) return {ok: false, why: "door", c: cell.c, nx, ny};
	let painted: Paint | null = null;
	if (cell.t === "paint") {
		nf = {...nf, b: cell.c};
		painted = cell.c;
	}
	let washed = false;
	if (cell.t === "wash") {
		washed = FACES.some((k) => nf[k]);
		nf = blank();
	}
	let sw = st.sw,
		flipped = -1;
	if (cell.t === "switch" && workColor(nf) === cell.c) {
		sw = st.sw.slice();
		sw[cell.i]! ^= 1;
		flipped = cell.i;
	}
	const ns: State = {x: nx, y: ny, f: nf, boxes, sw};
	const goal = cell.t === "goal";
	const won = goal && needEntries(L).every(([k, v]) => nf[k] === v);
	return {ok: true, nx, ny, st: ns, painted, washed, pushed, flipped, goal, won, cell};
}

export function stateKey(st: State): string {
	return (
		st.x + "," + st.y + "," + FACES.map((k) => st.f[k] || "-").join("") + "," + st.boxes.map((b) => b.x + ":" + b.y).join(";") + "," + st.sw.join("")
	);
}
