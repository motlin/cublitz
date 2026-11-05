import {readFileSync} from "node:fs";
import type {GeneratedLevel} from "../../src/core/infinite.ts";

export type SolveGolden =
{
	index: number;
	name: string;
	par: number | null;
	path: string | null;
	hitLimit: boolean;
};
export type InfiniteGolden =
{
	seed: number;
	n: number;
	level: GeneratedLevel;
	path: string;
};

/** A file in tests/golden/: each level's solution and a sample of generated infinite levels, recorded from the game. */
const readGolden = (name: string): unknown =>
	JSON.parse(readFileSync(new URL(`../golden/${name}`, import.meta.url), "utf8"));
export const readSolveGolden = (name: "solve-post-fix.json"): SolveGolden[] => readGolden(name) as SolveGolden[];
export const readInfiniteGolden = (name: "infinite-post-fix.json"): InfiniteGolden[] =>
	readGolden(name) as InfiniteGolden[];
