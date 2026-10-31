import {DIRS} from "../core/cube.ts";
import type {Direction, Level} from "../core/types.ts";
import {$} from "./dom.ts";
import {C} from "../main.ts";
import {hintState} from "./hint.ts";
import {mode} from "../main.ts";
import {S} from "./session.ts";
import {solState} from "./solution.ts";

// Hint and solution markers drawn on a flat layer above the 3D board
// Markers used to live on the tiles themselves, so the cube, boxes and doors could hide them.
// Now each tile center is projected to the screen and markers are drawn over everything.
type Point = {x: number; y: number};

let probes: HTMLElement[][] = [];
let ovRaf = 0;

export function buildProbes(L: Level, c: number): void {
	probes = [];
	for (let y = 0; y < L.rows; y++) {
		probes[y] = [];
		for (let x = 0; x < L.cols; x++) {
			const p = document.createElement("i");
			p.className = "probe";
			p.style.left = x * c + c / 2 + "px";
			p.style.top = y * c + c / 2 + "px";
			$("board").appendChild(p);
			probes[y]![x] = p;
		}
	}
}
function projector() {
	const vr = $("viewport").getBoundingClientRect();
	const cache = new Map<string, Point>();
	const at = (x: number, y: number): Point | null => {
		const k = x + "," + y;
		if (cache.has(k)) return cache.get(k)!;
		const p = probes[y] && probes[y][x];
		if (!p) return null;
		const r = p.getBoundingClientRect();
		const v = {x: r.left - vr.left, y: r.top - vr.top};
		cache.set(k, v);
		return v;
	};
	// on-screen size of one tile near (x, y)
	const size = (x: number, y: number): number => {
		const a = at(x, y)!,
			b = at(x + 1, y) || at(x - 1, y),
			d = at(x, y + 1) || at(x, y - 1);
		const s = [b, d].filter((q) => q !== null).map((q) => Math.hypot(q.x - a.x, q.y - a.y));
		return s.length ? Math.max(...s) : C();
	};
	return {at, size};
}
function ovEl(cls: string, p: Point, s: number, html?: string): HTMLElement {
	const el = document.createElement("div");
	el.className = "ov " + cls;
	el.style.left = p.x + "px";
	el.style.top = p.y + "px";
	el.style.setProperty("--s", s + "px");
	if (html) el.innerHTML = html;
	$("ovl").appendChild(el);
	return el;
}
function drawOverlays(): void {
	const layer = $("ovl");
	if (!layer) return;
	layer.innerHTML = "";
	if (!S || mode !== "play" || !probes.length) return;
	const P = projector(),
		L = S.L;
	// Hint: highlight rings, plus the numbered route on tier 3
	if (hintState) {
		const {m, tier} = hintState,
			rings: [number, number][] = [];
		if (m.type === "solid") {
			for (let y = 0; y < L.rows; y++)
				for (let x = 0; x < L.cols; x++) {
					const c = L.cells[y]![x];
					if (c && c.t === "paint" && c.c === m.c) rings.push([x, y]);
				}
		} else rings.push([m.x, m.y]);
		if (m.type === "button") {
			const b = S.st.boxes[m.box]!;
			rings.push([b.x, b.y]);
		}
		rings.forEach(([x, y]) => {
			const p = P.at(x, y);
			if (p) ovEl("ov-ring", p, P.size(x, y));
		});
		if (tier >= 3 && hintState.at === S.st) {
			let x = S.st.x,
				y = S.st.y;
			const steps = new Map<string, {x: number; y: number; n: number[]}>();
			[...m.path].forEach((d, i) => {
				x += DIRS[d as Direction][0];
				y += DIRS[d as Direction][1];
				const k = x + "," + y;
				if (!steps.has(k)) steps.set(k, {x, y, n: []});
				steps.get(k)!.n.push(i + 1);
			});
			steps.forEach(({x, y, n}) => {
				const p = P.at(x, y);
				if (p) ovEl("ov-trail" + (n.length > 1 ? " multi" : ""), p, P.size(x, y), `<span>${n.join(" ")}</span>`);
			});
		}
	}
	// Solution: arrows on the tile each roll lands on, pointing the way you roll
	if (solState && solState.path) {
		const {path, revealed} = solState,
			cells = new Map<string, {x: number; y: number; steps: {n: number; ang: number}[]}>();
		let x = S.st.x,
			y = S.st.y;
		for (let i = 0; i < revealed; i++) {
			const d = path[i] as Direction,
				px = x,
				py = y;
			x += DIRS[d][0];
			y += DIRS[d][1];
			const a = P.at(px, py),
				b = P.at(x, y);
			const ang = a && b ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI : 0;
			const k = x + "," + y;
			if (!cells.has(k)) cells.set(k, {x, y, steps: []});
			cells.get(k)!.steps.push({n: i + 1, ang});
		}
		cells.forEach(({x, y, steps}) => {
			const p = P.at(x, y);
			if (!p) return;
			ovEl(
				"ov-sol" + (steps.length > 1 ? " multi" : ""),
				p,
				P.size(x, y),
				steps.map((s) => `<span class="sa${s.n === 1 ? " now" : ""}${s.n === revealed ? " newest" : ""}"><i style="transform:rotate(${s.ang.toFixed(1)}deg)">→</i><b>${s.n}</b></span>`).join(""),
			);
		});
	}
}
export function scheduleOverlays(): void {
	cancelAnimationFrame(ovRaf);
	ovRaf = requestAnimationFrame(drawOverlays);
}
export function initOverlays(): void {
	try {
		new ResizeObserver(scheduleOverlays).observe($("viewport"));
	} catch {
		// Without ResizeObserver the markers just wait for the next redraw.
	}
}
