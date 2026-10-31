import {describe, expect, it} from "vite-plus/test";
import {hintTexts, nextMilestone} from "../../../src/core/hints.ts";
import {initState, parseLevel} from "../../../src/core/level.ts";
import {LEVELS} from "../../../src/core/levels.ts";
import {openColors, stateKey, tryMove} from "../../../src/core/rules.ts";
import {decodeLevel, encodeLevel} from "../../../src/core/share.ts";
import {solve} from "../../../src/core/solver.ts";
import type {Direction, Level, LevelSource, State} from "../../../src/core/types.ts";
import type {OriginalEngine, State as OriginalState} from "../../support/original-engine.ts";
import {loadOriginalEngine} from "../../support/original-engine.ts";

const original: OriginalEngine = loadOriginalEngine();
const DIRECTIONS: Direction[] = ["N", "S", "E", "W"];
const asOriginal = (state: State) => state as unknown as OriginalState;
const STATES_PER_LEVEL = 150;

/** Walks a level breadth first in both implementations, requiring every result to match exactly. */
function compareWalk(level: Level, theirLevel: ReturnType<OriginalEngine["parseLevel"]>, limit: number): unknown[] {
	const results: unknown[] = [];
	const queue = [initState(level)];
	const seen = new Set(queue.map(stateKey));
	for (let i = 0; i < queue.length && i < limit; i++) {
		const state = queue[i]!;
		for (const d of DIRECTIONS) {
			const mine = tryMove(level, state, d);
			const theirs = original.tryMove(theirLevel, asOriginal(state), d);
			results.push([JSON.stringify(mine), JSON.stringify(theirs)]);
			if (!mine.ok) continue;
			const key = stateKey(mine.st);
			if (!mine.won && !seen.has(key)) {
				seen.add(key);
				queue.push(mine.st);
			}
		}
		results.push([
			JSON.stringify(openColors(level, state)),
			JSON.stringify(original.openColors(theirLevel, asOriginal(state))),
		]);
		results.push([stateKey(state), original.stateKey(asOriginal(state))]);
	}
	return results;
}

const mismatches = (pairs: unknown[]) =>
	pairs.filter((pair) => (pair as [string, string])[0] !== (pair as [string, string])[1]);

describe("the core modules against the original script", () => {
	it("every move, open color and state key on every level, including key order", () => {
		const pairs = LEVELS.flatMap((level, index) => compareWalk(level, original.LEVELS[index]!, STATES_PER_LEVEL));
		expect(mismatches(pairs)).toStrictEqual([]);
		expect(pairs.length).toBeGreaterThan(5000);
	});

	it("every milestone and hint along every level's solution", () => {
		const collected = LEVELS.flatMap((level, index) => {
			const path = solve(level, initState(level)) ?? "";
			const theirLevel = original.LEVELS[index]!;
			const out: string[] = [];
			let state = initState(level);
			for (let i = 0; i < path.length; i++) {
				const mine = nextMilestone(level, state, path.slice(i));
				const theirs = original.nextMilestone(theirLevel, asOriginal(state), path.slice(i));
				const mineText = mine && hintTexts(level, state, mine);
				const theirText = theirs && original.hintTexts(theirLevel, asOriginal(state), theirs);
				out.push(
					JSON.stringify([mine, mineText]) === JSON.stringify([theirs, theirText])
						? ""
						: `${level.name} step ${i}`,
				);
				const next = tryMove(level, state, path[i] as Direction);
				if (!next.ok) throw new Error("the solution has to work");
				state = next.st;
			}
			return out;
		});
		expect(collected.filter(Boolean)).toStrictEqual([]);
		expect(collected.length).toBeGreaterThan(500);
	});

	it("malformed share-code levels behave the same, whatever the types say", () => {
		const oddities = [
			{map: [".X"]},
			{map: ["S?1"], k: {"1": ["paint", "r"]}},
			{map: ["S12"], k: {"1": ["gate", "z"], "2": ["floor", "r"]}},
			{map: ["S1"], k: {"1": ["switch"]}},
			{map: ["S😀X"]},
			{map: ["SX"], need: {t: "w"}},
			{map: ["SX"], need: null},
			{map: ["S1X"], k: null},
		] as unknown as LevelSource[];
		const compared = oddities.map((source) => {
			const mine = parseLevel(structuredClone(source));
			const theirs = original.parseLevel(structuredClone(source) as Parameters<OriginalEngine["parseLevel"]>[0]);
			return [JSON.stringify(mine), JSON.stringify(theirs), ...mismatches(compareWalk(mine, theirs, 20))];
		});
		expect(compared.map(([mine]) => mine)).toStrictEqual(compared.map(([, theirs]) => theirs));
		expect(compared.flatMap((entry) => entry.slice(2))).toStrictEqual([]);
	});

	it("a legend entry that cannot be destructured throws in both", () => {
		const source = {map: ["S1"], k: {"1": 5}};
		const fails = (parse: (level: never) => unknown) => {
			try {
				parse(structuredClone(source) as never);
				return "";
			} catch (error) {
				return (error as Error).constructor.name;
			}
		};
		expect(fails(parseLevel as (level: never) => unknown)).toBe(
			fails(original.parseLevel as (level: never) => unknown),
		);
		expect(fails(parseLevel as (level: never) => unknown)).toBe("TypeError");
	});

	it("share codes", () => {
		const level = {
			map: ["S★X"],
			name: "Blå ★ 日本",
			k: {},
			need: {t: "r"},
			par: 2,
		} as LevelSource;
		expect(encodeLevel(level)).toBe(original.encodeLevel(level));
		const codes = [encodeLevel(level), "CUBIST:eyJtYXAiOlsiUyJdfQ==", '{"map":[]}'];
		expect(codes.map(decodeLevel)).toStrictEqual(codes.map(original.decodeLevel));
	});
});
