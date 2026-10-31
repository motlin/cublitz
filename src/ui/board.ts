import {FACES, solidColor, workColor} from "../core/cube.ts";
import {solidColorOf, workColorOf} from "../core/prism.ts";
import {doorOpen, openColors, pressed} from "../core/rules.ts";
import type {Cell, Direction, Face, Level, Need, PieceColor, Unit} from "../core/types.ts";
import {$, type ElementById} from "./dom.ts";
import {hintState, renderHint} from "./hint.ts";
import {buildProbes, scheduleOverlays} from "./overlays.ts";
import {S} from "./session.ts";
import {renderSolution, solState} from "./solution.ts";
import {COLORS, GLYPH, WGLYPH} from "./text.ts";

type DoorPiece = {el: HTMLElement; x: number; y: number; c: PieceColor};

let tiles: Record<string, HTMLElement> = {};
let cubeEl: HTMLElement;
export let rollerEl: HTMLElement;
export let shadowEl: HTMLElement;
let faceEls: Partial<Record<Face, HTMLElement>> = {};
/** One per cube on a level with loose cubes, units first and then the loose ones, whichever cube each shows now. */
type CubeView = {
	cube: HTMLElement;
	roller: HTMLElement;
	faces: Partial<Record<Face, HTMLElement>>;
	shadow: HTMLElement;
};
let views: CubeView[] = [];
export let boxEls: HTMLElement[] = [];
let doorEls: DoorPiece[] = [];

export const C = (): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--c"));

function cellSize(L: Level): number {
	const vw = $("viewport").clientWidth || 600;
	const span = L.cols * 0.95 + L.rows * 0.31 + 1.2;
	return Math.max(24, Math.min(62, Math.floor(vw / span)));
}

// A raised block: top plus four walls, built from flat faces
function makeBlock(cls: string, w: number, h: number, color: string): [HTMLElement, HTMLElement] {
	const el = document.createElement("div");
	el.className = "block " + cls;
	el.style.width = el.style.height = w + "px";
	el.style.setProperty("--bc", color);
	const add = (k: string, css: Record<string, string | number>) => {
		const f = document.createElement("div");
		f.className = "bf bf-" + k;
		Object.assign(f.style, css);
		el.appendChild(f);
		return f;
	};
	add("n", {
		width: w + "px",
		height: h + "px",
		left: 0,
		top: 0,
		transformOrigin: "50% 0",
		transform: "rotateX(90deg)",
	});
	add("s", {
		width: w + "px",
		height: h + "px",
		left: 0,
		top: w + "px",
		transformOrigin: "50% 0",
		transform: "rotateX(90deg)",
	});
	add("w", {
		width: h + "px",
		height: w + "px",
		left: 0,
		top: 0,
		transformOrigin: "0 50%",
		transform: "rotateY(-90deg)",
	});
	add("e", {
		width: h + "px",
		height: w + "px",
		left: w + "px",
		top: 0,
		transformOrigin: "0 50%",
		transform: "rotateY(-90deg)",
	});
	const top = add("t", {width: w + "px", height: w + "px", left: 0, top: 0, transform: `translateZ(${h}px)`});
	return [el, top];
}

let board: ElementById<"board">;
export function initBoardElement(): void {
	board = $("board");
}
export function renderBoard(): void {
	const L = S.L;
	const c = cellSize(L);
	document.documentElement.style.setProperty("--c", c + "px");
	board.innerHTML = "";
	tiles = {};
	boxEls = [];
	doorEls = [];
	board.style.width = L.cols * c + "px";
	board.style.height = L.rows * c + "px";
	const need: Need = L.need || {};
	for (let y = 0; y < L.rows; y++)
		for (let x = 0; x < L.cols; x++) {
			const cell = L.cells[y]![x];
			if (!cell) continue;
			const t = document.createElement("div");
			t.className = "tile";
			t.style.left = x * c + "px";
			t.style.top = y * c + "px";
			const color = colorOf(cell);
			if (color) t.style.setProperty("--pc", COLORS[color]);
			const inner = document.createElement("i");
			t.appendChild(inner);
			const glyph = () => {
				const g = document.createElement("span");
				g.className = "glyph";
				g.textContent = GLYPH[color!];
				inner.appendChild(g);
			};
			if (cell.t === "paint") {
				t.classList.add("paint");
				glyph();
			}
			if (cell.t === "gate") {
				t.classList.add("gate");
				glyph();
			}
			if (cell.t === "wash") {
				t.classList.add("wash");
				const g = document.createElement("span");
				g.className = "glyph wsh";
				g.textContent = "✦";
				inner.appendChild(g);
			}
			if (cell.t === "wgate") {
				t.classList.add("wgate", "wg-" + cell.f);
				if (cell.f !== "b") {
					const g = document.createElement("span");
					g.className = "glyph wg";
					g.textContent = WGLYPH[cell.f]!;
					inner.appendChild(g);
				}
				if ("nsew".includes(cell.f)) {
					const e = document.createElement("span");
					e.className = "edge wedge " + cell.f;
					inner.appendChild(e);
				}
			}
			if (cell.t === "switch") {
				t.classList.add("switch");
				const lv = document.createElement("span");
				lv.className = "lever";
				inner.appendChild(lv);
			}
			if (cell.t === "button") {
				t.classList.add("button");
				const b = document.createElement("span");
				b.className = "knob";
				inner.appendChild(b);
			}
			if (cell.t === "door") {
				t.classList.add("door");
				const [blk, top] = makeBlock("door-block", c - 4, Math.round(c * 0.62), COLORS[cell.c]);
				top.textContent = GLYPH[cell.c];
				blk.style.left = x * c + 2 + "px";
				blk.style.top = y * c + 2 + "px";
				doorEls.push({el: blk, x, y, c: cell.c});
			}
			if (cell.t === "goal") {
				t.classList.add("goal");
				if (need.t) {
					t.classList.add("tinted");
					t.style.setProperty("--tc", COLORS[need.t]);
				}
				for (const k of ["n", "s", "e", "w"] as const)
					if (need[k]) {
						const e = document.createElement("span");
						e.className = "edge " + k;
						e.style.setProperty("--ec", COLORS[need[k]]);
						inner.appendChild(e);
					}
			}
			board.appendChild(t);
			tiles[x + "," + y] = t;
		}
	doorEls.forEach((d) => board.appendChild(d.el));
	shadowEl = document.createElement("div");
	shadowEl.className = "shadow";
	board.appendChild(shadowEl);
	S.st.boxes.forEach((b, i) => {
		const bw = Math.round(c * 0.8);
		const [blk, top] = makeBlock("crate", bw, bw, COLORS[b.c]);
		top.textContent = GLYPH[b.c];
		board.appendChild(blk);
		boxEls[i] = blk;
	});
	({cube: cubeEl, roller: rollerEl, faces: faceEls} = makeCube());
	board.appendChild(cubeEl);
	views = [];
	if (S.st.units) {
		views = [{cube: cubeEl, roller: rollerEl, faces: faceEls, shadow: shadowEl}];
		for (let i = S.st.units.length + S.st.loose!.length - 1; i > 0; i--) {
			const shadow = document.createElement("div");
			shadow.className = "shadow";
			board.appendChild(shadow);
			const view = {...makeCube(), shadow};
			board.appendChild(view.cube);
			views.push(view);
		}
	}
	buildProbes(L, c);
	placeCube();
	renderPieces(true);
	if (hintState) renderHint();
	if (solState) renderSolution();
	scheduleOverlays();
}

function makeCube(): Omit<CubeView, "shadow"> {
	const cube = document.createElement("div");
	cube.className = "cube";
	const roller = document.createElement("div");
	roller.className = "roller";
	const faces: CubeView["faces"] = {};
	for (const k of FACES) {
		const fe = document.createElement("div");
		fe.className = "face f-" + k;
		fe.appendChild(document.createElement("span"));
		roller.appendChild(fe);
		faces[k] = fe;
	}
	cube.appendChild(roller);
	return {cube, roller, faces};
}

/** A share code's legend can hand any cell a color the type does not list, so this reads it from any cell. */
const colorOf = (cell: Cell): PieceColor | undefined => (cell as {c?: PieceColor}).c;

function placeViews(): void {
	const c = C(),
		st = S.st;
	const solid = solidColorOf(st);
	const cubes: (Omit<Unit, "z"> & {z?: number})[] = [...st.units!, ...st.loose!];
	cubes.forEach((u, i) => {
		const view = views[i]!;
		view.cube.style.transform = `translate3d(${u.x * c}px, ${u.y * c}px, ${(u.z ?? 0) * c + 1}px)`;
		view.shadow.style.transform = `translate3d(${u.x * c + 4}px, ${u.y * c + 6}px, 0.5px)`;
		view.shadow.hidden = (u.z ?? 0) > 0;
		for (const k of FACES) {
			const col = u.f[k];
			view.faces[k]!.style.setProperty("--fc", col ? COLORS[col] : "var(--clay)");
			view.faces[k]!.firstChild!.textContent = col ? GLYPH[col] : "";
		}
		const isBlock = i < st.units!.length && !!solid;
		view.cube.classList.toggle("solid", isBlock);
		view.shadow.classList.toggle("solid", isBlock);
		if (isBlock) view.shadow.style.setProperty("--gc", COLORS[solid]);
	});
}

/** Tips every cube of the block over the one bottom edge they share. */
export function rollBlock(d: Direction, rotation: string): Animation[] {
	const c = C(),
		units = S.st.units!;
	const xs = units.map((u) => u.x),
		ys = units.map((u) => u.y);
	const pivotX = d === "E" ? Math.max(...xs) + 1 : Math.min(...xs),
		pivotY = d === "S" ? Math.max(...ys) + 1 : Math.min(...ys);
	return units.map((u, i) => {
		const roller = views[i]!.roller;
		const ox = d === "E" || d === "W" ? `${(pivotX - u.x) * c}px` : "50%",
			oy = d === "N" || d === "S" ? `${(pivotY - u.y) * c}px` : "50%";
		roller.style.transformOrigin = `${ox} ${oy} ${-u.z * c}px`;
		return roller.animate([{transform: "none"}, {transform: rotation}], {
			duration: 170,
			easing: "cubic-bezier(.45,.05,.55,.95)",
			fill: "forwards",
		});
	});
}

/** The cubes of a block swelling together as a new one joins. */
export function pulseBlock(): Animation[] {
	return S.st.units!.map((_, i) =>
		views[i]!.roller.animate([{transform: "none"}, {transform: "scale3d(1.14, 1.14, 1.14)"}, {transform: "none"}], {
			duration: 220,
			easing: "ease-out",
		}),
	);
}

export function placeCube(): void {
	if (S.st.units) {
		placeViews();
		return;
	}
	const c = C(),
		st = S.st;
	cubeEl.style.transform = `translate3d(${st.x * c}px, ${st.y * c}px, 1px)`;
	shadowEl.style.transform = `translate3d(${st.x * c + 4}px, ${st.y * c + 6}px, 0.5px)`;
	for (const k of FACES) {
		const col = st.f[k];
		faceEls[k]!.style.setProperty("--fc", col ? COLORS[col] : "var(--clay)");
		faceEls[k]!.firstChild!.textContent = col ? GLYPH[col] : "";
	}
	const solid = solidColor(st.f);
	cubeEl.classList.toggle("solid", !!solid);
	shadowEl.classList.toggle("solid", !!solid);
	if (solid) shadowEl.style.setProperty("--gc", COLORS[solid]);
}

// Switches, buttons, doors and boxes all follow the current state
export function renderPieces(instant?: boolean): void {
	const L = S.L,
		st = S.st,
		c = C();
	const open = openColors(L, st),
		solid = st.units ? workColorOf(st) : workColor(st.f);
	L.switches.forEach((s, i) => tiles[s.x + "," + s.y]!.classList.toggle("on", !!st.sw[i]));
	for (const key in tiles) {
		const t = tiles[key]!;
		if (!t.classList.contains("button")) continue;
		const [x, y] = key.split(",").map(Number) as [number, number];
		t.classList.toggle("down", pressed(L, st, x, y, solid));
	}
	doorEls.forEach((d) => d.el.classList.toggle("open", doorOpen(L, st, d.x, d.y, open)));
	st.boxes.forEach((b, i) => {
		const el = boxEls[i]!,
			off = Math.round(c * 0.1);
		if (instant) el.style.transition = "none";
		el.style.transform = `translate3d(${b.x * c + off}px, ${b.y * c + off}px, 1px)`;
		if (instant) {
			void el.offsetWidth;
			el.style.transition = "";
		}
	});
}

export function pulse(x: number, y: number, cls: string): void {
	const t = tiles[x + "," + y];
	if (!t) return;
	t.classList.remove(cls);
	void t.offsetWidth;
	t.classList.add(cls);
}
