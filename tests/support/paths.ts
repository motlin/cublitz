import type {Level, State} from "../../src/core/types.ts";
import type {Engine} from "./engine.ts";

const KEYS: Record<string, string> =
{
	N: "ArrowUp",
	S: "ArrowDown",
	E: "ArrowRight",
	W: "ArrowLeft",
};

export const keyFor = (direction: string): string =>
{
	const key = KEYS[direction];
	if (!key) throw new Error(`Unknown direction ${direction}`);
	return key;
};

function* reachable(engine: Engine, level: Level, limit: number): Generator<[State, string]>
{
	const start = engine.initState(level);
	const queue: [State, string][] = [[start, ""]];
	const seen = new Set([engine.stateKey(start)]);
	for (let i = 0; i < queue.length && i < limit; i++)
	{
		const entry = queue[i]!;
		yield entry;
		for (const d of "NSEW")
		{
			const r = engine.tryMove(level, entry[0], d);
			if (!r.ok || r.won) continue;
			const key = engine.stateKey(r.st);
			if (seen.has(key)) continue;
			seen.add(key);
			queue.push([r.st, entry[1] + d]);
		}
	}
}

export type BlockedMove =
{
	path: string;
	dir: string;
};

/** Shortest path to a state where rolling `dir` is refused for reason `why`; `accept` narrows further. */
export function findBlockedMove(
	engine: Engine,
	level: Level,
	why: string,
	accept: (detail: Record<string, unknown>) => boolean = () => true,
): BlockedMove | null
{
	for (const [state, path] of reachable(engine, level, 200000))
	{
		for (const dir of "NSEW")
		{
			const r = engine.tryMove(level, state, dir);
			if (!r.ok && r.why === why && accept(r))
				return {
					path,
					dir,
				};
		}
	}
	return null;
}

/** Shortest path to a roll landing on the target without meeting its needs. */
export function findMissedGoal(engine: Engine, level: Level): string | null
{
	for (const [state, path] of reachable(engine, level, 200000))
	{
		for (const dir of "NSEW")
		{
			const r = engine.tryMove(level, state, dir);
			if (r.ok && r.goal && !r.won) return path + dir;
		}
	}
	return null;
}

/** Shortest path to a position that can no longer be finished, or null when every position can be. */
export function findDeadEnd(engine: Engine, level: Level, limit = 3000): string | null
{
	for (const [state, path] of reachable(engine, level, limit))
	{
		if (engine.solve(level, state) === null && !engine.solve.hitLimit) return path;
	}
	return null;
}
