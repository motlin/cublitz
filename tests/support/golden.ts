import type {GeneratedLevel, OriginalEngine} from "./original-engine.ts";

export type SolveGolden = {
	index: number;
	name: string;
	par: number | null;
	path: string | null;
	hitLimit: boolean;
};
export type InfiniteGolden = {seed: number; n: number; level: GeneratedLevel; path: string};

export const INFINITE_SEEDS = [1, 12345, 999999999];
export const INFINITE_LEVEL_NUMBERS = [0, 1, 2, 3, 5, 8, 14];

// solve()'s default limit, the same call the original makes when its own limit is not raised.
export function generateSolveGolden(engine: OriginalEngine): SolveGolden[] {
	return engine.LEVELS.map((level, index) => {
		const path = engine.solve(level, engine.initState(level));
		return {index, name: level.name ?? "", par: level.par ?? null, path, hitLimit: engine.solve.hitLimit};
	});
}

export function generateInfiniteGolden(engine: OriginalEngine): InfiniteGolden[] {
	return INFINITE_SEEDS.flatMap((seed) =>
		INFINITE_LEVEL_NUMBERS.map((n) => {
			const level = engine.generateInfinite(seed, n);
			const parsed = engine.parseLevel(JSON.parse(JSON.stringify(level)));
			const path = engine.solve(parsed, engine.initState(parsed), 400000);
			if (path === null) throw new Error(`Generated level ${seed}/${n} has no solution`);
			return {seed, n, level: JSON.parse(JSON.stringify(level)) as GeneratedLevel, path};
		}),
	);
}
