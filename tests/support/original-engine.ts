import {readFileSync} from "node:fs";

export type LevelSource = {
	map: string[];
	name?: string;
	tip?: string;
	par?: number;
	k?: Record<string, [string, string]>;
	need?: Record<string, string>;
};
export type Level = LevelSource & {cols: number; rows: number};
export type State = {x: number; y: number; f: Record<string, string>; boxes: unknown[]; sw: number[]};
export type MoveResult = {
	ok: boolean;
	why?: string;
	st?: State;
	goal?: boolean;
	won?: boolean;
	[detail: string]: unknown;
};
export type GeneratedLevel = LevelSource & {name: string; inf: number; par: number};
export type OriginalEngine = {
	LEVELS: Level[];
	parseLevel: (source: LevelSource) => Level;
	initState: (level: Level) => State;
	tryMove: (level: Level, state: State, direction: string) => MoveResult;
	stateKey: (state: State) => string;
	solve: ((level: Level, state: State, limit?: number) => string | null) & {hitLimit: boolean};
	generateInfinite: (seed: number, n: number) => GeneratedLevel;
};

const between = (text: string, from: string, to: string): string => {
	const start = text.indexOf(from);
	const end = text.indexOf(to, start);
	if (start < 0 || end < 0) throw new Error(`Could not find ${from} .. ${to} in legacy/original.html`);
	return text.slice(start, end);
};

/** Evaluates the pure parts of the verbatim <script> from legacy/original.html, without a DOM. */
export function loadOriginalEngine(): OriginalEngine {
	const html = readFileSync(new URL("../../legacy/original.html", import.meta.url), "utf8");
	const source = [
		between(html, "const LEVELS = [", "const COLORS = {"),
		between(html, "// ==ENGINE==", "LEVELS.forEach(L => parseLevel(L));"),
		"LEVELS.forEach(L => parseLevel(L));",
		between(html, "// ==INFGEN==", "// ---------- Infinite mode"),
		"let infGenToken = 0, run = null;",
		between(html, "function genInf(", "function pregenerate("),
		`function generateInfinite(seed, n) {
			run = { seed };
			let level = null;
			genInf(n, lv => { level = lv; });
			return level;
		}`,
		"return { LEVELS, parseLevel, initState, tryMove, stateKey, solve, generateInfinite };",
	].join("\n");
	// genInf yields to the browser between batches of tries; here the next batch can simply run.
	const runNow = (step: () => void): void => step();
	return new Function("setTimeout", source)(runNow) as OriginalEngine;
}
