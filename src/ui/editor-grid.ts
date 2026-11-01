import {FACES} from "../core/cube.ts";
import {parseLevel} from "../core/level.ts";
import type {Legend, LegendEntry, LevelSource, Need, PieceColor} from "../core/types.ts";
import type {EditorCell, EditorDraft} from "./storage.ts";
import {COLORS, WGLYPH} from "./text.ts";

// The editor's grid and what it becomes, without the page.

/** The stylesheets must stay the original's, so a loose cube is drawn inline: a clay block with a plus on it. */
export const LOOSE_CUBE_STYLE =
	"background:linear-gradient(#1b1e29,#1b1e29) center/12% 44% no-repeat,linear-gradient(#1b1e29,#1b1e29) center/44% 12% no-repeat,linear-gradient(var(--clay),var(--clay)) center/72% 72% no-repeat,linear-gradient(135deg,var(--tile-hi),var(--tile))";

export type GridCheck = {level: LevelSource; error?: undefined} | {level?: undefined; error: string};

export function blankGrid(cols: number, rows: number): (EditorCell | null)[][] {
	return Array.from({length: rows}, () => Array.from({length: cols}, () => ({t: "floor"}) as const));
}
export function newEditor(): EditorDraft {
	const g = blankGrid(8, 5);
	g[2]![0] = {t: "start"};
	g[2]![7] = {t: "goal"};
	return {id: null, name: "Untitled", cols: 8, rows: 5, grid: g, need: {}};
}
export function draftFromLevel(L: LevelSource, name: string, id: string | null): EditorDraft {
	const P = parseLevel(JSON.parse(JSON.stringify({map: L.map, k: L.k, need: L.need})) as LevelSource);
	const grid: (EditorCell | null)[][] = [];
	for (let y = 0; y < P.rows; y++) {
		grid[y] = [];
		for (let x = 0; x < P.cols; x++) {
			const c = P.cells[y]![x];
			grid[y]![x] = !c
				? null
				: c.t === "floor"
					? {t: "floor"}
					: c.t === "wash"
						? {t: "wash"}
						: c.t === "wgate"
							? {t: "wgate", f: c.f}
							: ({t: c.t, c: (c as {c?: PieceColor}).c} as EditorCell);
		}
	}
	grid[P.sy]![P.sx] = {t: "start"};
	P.boxes0.forEach((b) => {
		grid[b.y]![b.x] = {t: "box", c: b.c};
	});
	P.cubes0?.forEach((cube) => {
		grid[cube.y]![cube.x] = {t: "cube"};
	});
	return {id, name, cols: P.cols, rows: P.rows, grid, need: {...L.need}};
}

// Editor grid -> level data the game understands
export function edToLevel(ED: EditorDraft): GridCheck {
	const POOL = "1234567890@#$%&*+=~^!?<>[](){}|;:,_/";
	const k: Legend = {},
		rev: Record<string, string> = {};
	let starts = 0,
		goals = 0;
	const map = ED.grid.map((row) =>
		row
			.map((c) => {
				if (!c) return " ";
				if (c.t === "floor") return ".";
				if (c.t === "start") {
					starts++;
					return "S";
				}
				if (c.t === "goal") {
					goals++;
					return "X";
				}
				if (c.t === "paint") return c.c;
				if (c.t === "gate") return c.c.toUpperCase();
				if (c.t === "wgate" && c.f === "b") return "W";
				if (c.t === "wash") return "Z";
				const param = c.t === "wgate" ? c.f : c.t === "cube" ? "w" : c.c;
				const key = c.t + param;
				if (!rev[key]) {
					const ch = POOL[Object.keys(rev).length]!;
					rev[key] = ch;
					k[ch] = [c.t, param] as LegendEntry;
				}
				return rev[key];
			})
			.join("")
			.replace(/\s+$/, ""),
	);
	const need: Need = {};
	for (const f of FACES) if (ED.need[f]) need[f] = ED.need[f];
	const L: LevelSource = {name: ED.name.trim() || "Untitled", map, k};
	if (Object.keys(need).length) L.need = need;
	if (starts !== 1) return {error: starts ? "Place only one start." : "Place a start tile."};
	if (!goals) return {error: "Place at least one target."};
	return {level: L};
}

export function edCellHTML(c: EditorCell | null, need: Need): string {
	if (!c) return '<div class="ec void"></div>';
	if (c.t === "wash") return '<div class="ec wash"><b>✦</b></div>';
	if (c.t === "cube") return `<div class="ec loose" style="${LOOSE_CUBE_STYLE}"></div>`;
	if (c.t === "wgate") return `<div class="ec wgate wg-${c.f}">${WGLYPH[c.f] ? `<b>${WGLYPH[c.f]}</b>` : ""}</div>`;
	const color = (c as {c?: PieceColor}).c;
	const style = color
		? ` style="--pc:${COLORS[color]}"`
		: c.t === "goal" && need.t
			? ` style="--pc:${COLORS[need.t]}"`
			: "";
	return `<div class="ec ${c.t}"${style}></div>`;
}
