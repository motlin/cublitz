import {type GeneratedLevel, infSearch} from "../../src/core/infinite.ts";
import {initState, parseLevel} from "../../src/core/level.ts";
import {LEVELS} from "../../src/core/levels.ts";
import {stateKey, tryMove} from "../../src/core/rules.ts";
import {solve} from "../../src/core/solver.ts";
import type {Direction, Level, MoveResult, State} from "../../src/core/types.ts";

/** Level n of the run with this seed, searching batch after batch as the page does between frames. */
function generateInfinite(seed: number, n: number): GeneratedLevel
{
	const next = infSearch(seed, n);
	for (;;)
	{
		const level = next();
		if (level) return level;
	}
}

// The game's pure code in one object, for helpers that search or replay levels by direction letter.
export const engine =
{
	LEVELS,
	parseLevel,
	initState,
	tryMove: (level: Level, state: State, direction: string): MoveResult =>
		tryMove(level, state, direction as Direction),
	stateKey,
	solve,
	generateInfinite,
};
export type Engine = typeof engine;
