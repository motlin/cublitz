import {stateKey, tryMove} from "./rules.ts";
import type {Direction, Level, State} from "./types.ts";

// The search order decides which of several shortest paths comes back, so par and the hints depend on it.
const SEARCH_ORDER: Direction[] = ["N", "S", "E", "W"];

export function solve(L: Level, st0: State, limit = 400000): string | null
{
	// Each state keeps only the roll that reached it and where it came from, and is dropped once expanded
	const states: (State | null)[] = [st0];
	const parents: number[] = [-1];
	const moves: Direction[] = [];
	const seen = new Set([stateKey(st0)]);
	const pathTo = (i: number): string =>
	{
		let p = "";
		for (let j = i; j > 0; j = parents[j]!) p = moves[j]! + p;
		return p;
	};
	solve.hitLimit = false;
	for (let i = 0; i < states.length; i++)
	{
		if (seen.size >= limit)
		{
			solve.hitLimit = true;
			return null;
		}
		const st = states[i]!;
		states[i] = null;
		for (const d of SEARCH_ORDER)
		{
			const r = tryMove(L, st, d);
			if (!r.ok) continue;
			if (r.won) return pathTo(i) + d;
			const k = stateKey(r.st);
			if (seen.has(k)) continue;
			seen.add(k);
			moves[states.length] = d;
			parents.push(i);
			states.push(r.st);
		}
	}
	return null;
}
/** Whether the most recent solve() gave up at its limit. Infinite generation also overwrites this. */
solve.hitLimit = false;
