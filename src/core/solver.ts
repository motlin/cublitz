import {stateKey, tryMove} from "./rules.ts";
import type {Direction, Level, State} from "./types.ts";

// The search order decides which of several shortest paths comes back, so par and the hints depend on it.
const SEARCH_ORDER: Direction[] = ["N", "S", "E", "W"];

export function solve(L: Level, st0: State, limit = 400000): string | null {
	const q: [State, string][] = [[st0, ""]];
	const seen = new Set([stateKey(st0)]);
	solve.hitLimit = false;
	for (let i = 0; i < q.length; i++) {
		if (seen.size >= limit) {
			solve.hitLimit = true;
			return null;
		}
		const [st, p] = q[i]!;
		for (const d of SEARCH_ORDER) {
			const r = tryMove(L, st, d);
			if (!r.ok) continue;
			if (r.won) return p + d;
			const k = stateKey(r.st);
			if (seen.has(k)) continue;
			seen.add(k);
			q.push([r.st, p + d]);
		}
	}
	return null;
}
/** Whether the most recent solve() gave up at its limit. Infinite generation also overwrites this. */
solve.hitLimit = false;
