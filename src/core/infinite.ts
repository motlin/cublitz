// Infinite mode level generator. Builds a random corridor split by walls (color gates or
// white gates), scatters puddles, then keeps only layouts the solver can finish where the
// walls genuinely matter. Difficulty climbs with the level number.
import {initState, parseLevel} from "./level.ts";
import {solve} from "./solver.ts";
import type {Face, Legend, LegendEntry, LevelSource, Need, Paint} from "./types.ts";

type Rng = () => number;
type NamedWallFace = Exclude<Face, "b">;
type Wall = {x: number; kind: "w"; f: Face} | {x: number; kind: "c"; c: Paint};
export type InfiniteCandidate = {map: string[]; k: Legend; need?: Need};
export type InfiniteLevel = {map: string[]; k: Legend; need: Need | undefined; par: number};
export type GeneratedLevel = InfiniteLevel & {name: string; inf: number};
export type InfiniteRun = {effs: number[]};

// prettier-ignore
export function infRng(a: number): Rng { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const INF_FACE_CH: Record<NamedWallFace, string> = {t: "1", n: "2", s: "3", e: "4", w: "5"};
const INF_K: Record<string, LegendEntry> = {"1": ["wgate", "t"], "2": ["wgate", "n"], "3": ["wgate", "s"], "4": ["wgate", "e"], "5": ["wgate", "w"]};
// Arrays rather than the original's strings, so that picks keep their types. Same order, same indexing.
const PALETTE_ORDER: Paint[] = ["r", "o", "y", "g", "c", "b", "p"];
const ALL_WALL_FACES: Face[] = ["b", "t", "n", "s", "e", "w"];
const EARLY_WALL_FACES: Face[] = ["b", "t"];

export function infTier(n: number): number {
	return Math.min(7, Math.floor(n / 2));
}

export function infCandidate(R: Rng, n: number): InfiniteCandidate {
	const tier = infTier(n);
	const pick = <T>(a: T[]): T => a[Math.floor(R() * a.length)]!;
	const H = tier >= 3 && R() < 0.5 ? 4 : 3,
		W = Math.min(15, 7 + tier + Math.floor(R() * 3));
	const mid = Math.floor((H - 1) / 2) + (H === 4 && R() < 0.5 ? 1 : 0);
	const palette = [...PALETTE_ORDER].sort(() => R() - 0.5).slice(0, tier >= 4 ? 3 : 2);
	const g = Array.from({length: H}, () => Array<string>(W).fill("."));
	// walls
	const nWalls = 1 + (tier >= 2 ? 1 : 0) + (tier >= 5 && R() < 0.5 ? 1 : 0);
	const xs: number[] = [];
	let tries = 0;
	while (xs.length < nWalls && tries++ < 40) {
		const x = 2 + Math.floor(R() * (W - 4));
		if (xs.every((v) => Math.abs(v - x) > 2)) xs.push(x);
	}
	xs.sort((a, b) => a - b);
	const walls = xs.map((x): Wall => {
		if (tier >= 3 && R() < 0.45) {
			const f = tier >= 4 ? pick(ALL_WALL_FACES) : pick(EARLY_WALL_FACES);
			return {x, kind: "w", f};
		}
		return {x, kind: "c", c: pick(palette)};
	});
	walls.forEach((w) => {
		for (let y = 0; y < H; y++) g[y]![w.x] = w.kind === "c" ? w.c.toUpperCase() : w.f === "b" ? "W" : INF_FACE_CH[w.f];
	});
	// puddles and the odd hole
	const dens = 0.18 + R() * 0.22 + tier * 0.02;
	for (let y = 0; y < H; y++)
		for (let x = 1; x < W - 1; x++) {
			if (g[y]![x] !== ".") continue;
			const r = R();
			if (r < dens) g[y]![x] = pick(palette);
			else if (r < dens + 0.07) g[y]![x] = " ";
		}
	// every color wall gets a puddle of its color somewhere before it
	let lastX = 0;
	walls.forEach((w) => {
		if (w.kind === "c") {
			const x = lastX + 1 + Math.floor(R() * Math.max(1, w.x - lastX - 1));
			const y = Math.floor(R() * H);
			if (x < w.x && g[y]![x] !== "S") g[y]![x] = w.c;
		}
		lastX = w.x;
	});
	if (tier >= 4 && R() < 0.35) {
		const x = 1 + Math.floor(R() * (W - 2)),
			y = Math.floor(R() * H);
		if (/[.a-z]/.test(g[y]![x]!)) g[y]![x] = "Z";
	}
	g[mid]![0] = "S";
	g[mid]![W - 1] = "X";
	for (let y = 0; y < H; y++) if (y !== mid) g[y]![W - 1] = " ";
	const L: InfiniteCandidate = {map: g.map((r) => r.join("").replace(/\s+$/, "")), k: {}};
	L.map
		.join("")
		.split("")
		.forEach((ch) => {
			if (INF_K[ch]) L.k[ch] = INF_K[ch];
		});
	if (tier >= 3 && R() < 0.3) L.need = {t: pick(palette)};
	return L;
}

// The same layout with every rule that makes it a puzzle switched off
export function infRelaxed(L: LevelSource): {map: string[]; k: Legend} {
	return {map: L.map.map((r) => r.replace(/[ROYGCBPW1-5]/g, ".")), k: {}};
}

// Try one candidate; returns a finished level or null
export function infTry(R: Rng, n: number): InfiniteLevel | null {
	const tier = infTier(n);
	const L = parseLevel(infCandidate(R, n));
	const sol = solve(L, initState(L), 90000);
	if (!sol) return null;
	const lo = 5 + tier * 2,
		hi = 12 + tier * 4;
	if (sol.length < lo || sol.length > hi) return null;
	const F = parseLevel(infRelaxed(L)),
		free = solve(F, initState(F), 90000);
	const need = tier === 0 ? 0 : 1 + Math.floor(tier / 2);
	if (free && sol.length - free.length < need) return null;
	return {map: L.map, k: L.k, need: L.need, par: sol.length};
}

/** The search for level n of a run. Each call runs one batch of tries, so the caller can yield between
 * batches to keep the page responsive, and returns the level, or null when the batch found none. */
export function infSearch(seed: number, n: number): () => GeneratedLevel | null {
	const R = infRng(seed + n * 7919);
	let tries = 0;
	return () => {
		for (let i = 0; i < 6; i++) {
			tries++;
			const lv = infTry(R, tries > 240 ? Math.max(0, n - 4) : n);
			if (lv) return {...lv, name: `Canvas ${n + 1}`, inf: n};
		}
		return null;
	};
}

const RANKS: [number, string][] = [
	[99, "Grandmaster"],
	[95, "Master"],
	[90, "Artist"],
	[82, "Painter"],
	[72, "Sketcher"],
	[60, "Doodler"],
	[0, "Smudger"],
];

export function infRating(r: InfiniteRun): number {
	const last = r.effs.slice(-10);
	return last.length ? Math.round((100 * last.reduce((a, b) => a + b, 0)) / last.length) : 0;
}

export function infRank(r: InfiniteRun): string {
	return r.effs.length < 3 ? "Unranked" : RANKS.find(([min]) => infRating(r) >= min)![1];
}
