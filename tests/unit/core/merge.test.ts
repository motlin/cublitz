import {describe, expect, it} from "vite-plus/test";
import {blank} from "../../../src/core/cube.ts";
import {cellAt, initState, parseLevel} from "../../../src/core/level.ts";
import {LEVELS} from "../../../src/core/levels.ts";
import {MERGE_LEVELS} from "../../../src/core/merge-levels.ts";
import {exposedWorkColor, withUnits} from "../../../src/core/prism.ts";
import {openColors, stateKey, tryMove} from "../../../src/core/rules.ts";
import {decodeLevel, encodeLevel, levelFromSearch} from "../../../src/core/share.ts";
import {solve} from "../../../src/core/solver.ts";
import type {Direction, Level, LevelSource, MoveSuccess, State} from "../../../src/core/types.ts";

const CUBE: LevelSource["k"] = {"+": ["cube", "w"]};
const start = (map: string[], k: LevelSource["k"] = CUBE, extra: Partial<LevelSource> = {}) => {
	const level = parseLevel({map, k, ...extra});
	return {level, state: initState(level)};
};
const step = (level: Level, state: State, d: Direction): MoveSuccess => {
	const r = tryMove(level, state, d);
	if (!r.ok) throw new Error(`refused ${d}: ${r.why}`);
	return r;
};
const walk = (level: Level, state: State, path: string): State =>
	path.split("").reduce((st, d) => step(level, st, d as Direction).st, state);
const places = (st: State) => st.units!.map(({x, y, z}) => [x, y, z]);

const lying = (map: string[], k: LevelSource["k"] = CUBE) => {
	const {level, state} = start(map, k);
	return {level, state: walk(level, state, "E")};
};

describe("a level with loose cubes", () => {
	it("parses them onto floor cells and starts them unmerged", () => {
		const {level, state} = start(["S+X"]);
		expect(level.cubes0).toStrictEqual([{x: 1, y: 0}]);
		expect(cellAt(level, 1, 0)).toStrictEqual({t: "floor"});
		expect(state).toStrictEqual({
			x: 0,
			y: 0,
			f: blank(),
			boxes: [],
			sw: [],
			units: [{x: 0, y: 0, z: 0, f: blank()}],
			loose: [{x: 1, y: 0, f: blank()}],
		});
	});

	it("leaves a level without cubes exactly as it was", () => {
		const level = parseLevel({map: ["SX"]});
		expect(Object.keys(level)).toStrictEqual(["map", "cells", "boxes0", "switches", "cols", "rows", "sx", "sy"]);
		expect(Object.keys(initState(level))).toStrictEqual(["x", "y", "f", "boxes", "sw"]);
	});
});

describe("merging", () => {
	it("pressing toward an adjacent cube merges without moving", () => {
		const {level, state} = start(["S+.X"]);
		const r = step(level, state, "E");
		expect(r).toStrictEqual({
			ok: true,
			nx: 1,
			ny: 0,
			st: {
				x: 0,
				y: 0,
				f: blank(),
				boxes: [],
				sw: [],
				units: [
					{x: 0, y: 0, z: 0, f: blank()},
					{x: 1, y: 0, z: 0, f: blank()},
				],
				loose: [],
			},
			painted: null,
			washed: false,
			pushed: -1,
			flipped: -1,
			goal: false,
			won: false,
			cell: {t: "floor"},
			merged: true,
		});
	});

	it("pressing the same direction again rolls the whole block up onto its end", () => {
		const {level, state} = start(["S+..X"]);
		const merged = step(level, state, "E").st;
		const r = step(level, merged, "E");
		expect([r.merged, places(r.st)]).toStrictEqual([
			undefined,
			[
				[2, 0, 1],
				[2, 0, 0],
			],
		]);
	});

	it("repeats, so a 1x2 can take on another cube along its length to make a 1x3", () => {
		const {level, state} = start(["S++..X"]);
		const st = walk(level, state, "EE");
		expect(places(st)).toStrictEqual([
			[0, 0, 0],
			[1, 0, 0],
			[2, 0, 0],
		]);
		expect(st.loose).toStrictEqual([]);
	});

	it("refuses a cube beside a block lying across the roll, and one reached while standing", () => {
		const {level, state} = start([".S+", "..+"]);
		const merged = walk(level, state, "E");
		expect(tryMove(level, merged, "S")).toStrictEqual({ok: false, why: "misaligned", nx: 2, ny: 1});

		const standing = start(["S+.+."]);
		const up = walk(standing.level, standing.state, "EE");
		expect(tryMove(standing.level, up, "E")).toStrictEqual({ok: false, why: "misaligned", nx: 3, ny: 0});
	});

	it("keeps a box from being pushed onto a loose cube", () => {
		const {level, state} = start(["S1+"], {...CUBE, "1": ["box", "w"]});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "stuck", c: "w", nx: 1, ny: 0});
	});
});

describe("rolling a block", () => {
	it("falls from standing down onto the cells ahead", () => {
		const {level, state} = lying(["S+....X"]);
		const st = walk(level, state, "EE");
		expect(places(st)).toStrictEqual([
			[4, 0, 0],
			[3, 0, 0],
		]);
	});

	it("rolls along the cross axis and stays lying", () => {
		const {level, state} = lying(["S+", ".."]);
		expect(places(step(level, state, "S").st)).toStrictEqual([
			[0, 1, 0],
			[1, 1, 0],
		]);
	});

	it("turns every cube's own faces", () => {
		const {level, state} = lying(["S+", "rg", ".."]);
		const st = walk(level, state, "SS");
		expect(st.units!.map((u) => u.f.n)).toStrictEqual(["r", "g"]);
		expect(st.units!.map((u) => u.f.b)).toStrictEqual(["", ""]);
	});

	it("paints only the cube touching each puddle", () => {
		const {level, state} = lying(["S+", "r."]);
		expect(step(level, state, "S").st.units!.map((u) => u.f.b)).toStrictEqual(["r", ""]);
	});

	it("is stopped by an edge under either end", () => {
		const {level, state} = lying(["S+", ". "]);
		expect(tryMove(level, state, "S")).toStrictEqual({ok: false, why: "edge", nx: 1, ny: 1});
	});

	it("tests every cube against its gate", () => {
		const {level, state} = lying(["S+", ".R"]);
		expect(tryMove(level, state, "S")).toStrictEqual({ok: false, why: "gate", c: "r", down: "", nx: 1, ny: 1});
	});

	it("tests every cube against its white gate", () => {
		const {level, state} = lying(["S+", "rg", "..", "..", "..", ".W"]);
		const st = walk(level, state, "SSSS");
		expect(tryMove(level, st, "S")).toStrictEqual({ok: false, why: "wgate", f: "b", has: "g", nx: 1, ny: 5});
	});

	it("will not push a box", () => {
		const {level, state} = lying(["S+", ".1", ".."], {...CUBE, "1": ["box", "w"]});
		expect(tryMove(level, state, "S")).toStrictEqual({ok: false, why: "heavy", nx: 1, ny: 1});
	});

	it("washes the whole block on a paint remover", () => {
		const {level, state} = lying(["S+", "r.", "Z."]);
		const r = step(level, walk(level, state, "S"), "S");
		expect([r.washed, r.st.units!.map((u) => u.f)]).toStrictEqual([true, [blank(), blank()]]);
	});

	it("wins when any cube rests on the target with the need met on that cube", () => {
		const {level, state} = lying(["S+", ".X"]);
		const r = step(level, state, "S");
		expect([r.goal, r.won, r.cell]).toStrictEqual([true, true, {t: "goal"}]);

		const needy = parseLevel({map: ["S+", ".X"], k: CUBE, need: {t: "r"}});
		const refused = step(needy, walk(needy, initState(needy), "E"), "S");
		expect([refused.goal, refused.won]).toStrictEqual([true, false]);
	});

	it("holds a button and opens its door from any cell of the footprint", () => {
		const {level, state} = lying(["S+", ".1", "2."], {...CUBE, "1": ["button", "w"], "2": ["door", "w"]});
		const st = step(level, state, "S").st;
		expect(openColors(level, st)).toStrictEqual({w: true});
	});

	it("flips a switch only when the block's exposed faces are all that color", () => {
		const {level, state} = lying(["S+", ".1"], {...CUBE, "1": ["switch", "w"]});
		const r = step(level, state, "S");
		expect([r.flipped, r.st.sw]).toStrictEqual([0, [1]]);
	});
});

describe("a 1x3 over a gap", () => {
	it("hangs its middle cube over one void, supported at both ends", () => {
		const {level, state} = start(["S++.. .X"]);
		const standing = walk(level, state, "EEE");
		const over = step(level, standing, "E");
		expect(places(over.st).map(([x]) => x)).toStrictEqual([6, 5, 4]);
		expect(over.nx).toBe(4);
		expect(step(level, over.st, "E").won).toBe(true);
	});

	it("is not something a 1x2 can do", () => {
		const {level, state} = start(["S+... .X"]);
		expect(tryMove(level, walk(level, state, "EEE"), "E")).toStrictEqual({ok: false, why: "edge", nx: 5, ny: 0});
	});

	it("cannot rest with an end over the void", () => {
		const {level, state} = start(["S++.  ."]);
		expect(tryMove(level, walk(level, state, "EEE"), "E")).toStrictEqual({ok: false, why: "edge", nx: 4, ny: 0});
	});
});

describe("exposedWorkColor", () => {
	it("ignores the faces cubes press together", () => {
		const red = {t: "r", b: "r", n: "r", s: "r", e: "r", w: "r"} as const;
		const units = [
			{x: 0, y: 0, z: 0, f: {...red, e: ""}},
			{x: 1, y: 0, z: 0, f: {...red, w: ""}},
		] as const;
		expect(exposedWorkColor(units as never)).toBe("r");
	});

	it("is white when bare, and nothing when mixed", () => {
		const bare = [{x: 0, y: 0, z: 0, f: blank()}];
		expect(exposedWorkColor(bare)).toBe("w");
		expect(exposedWorkColor([{x: 0, y: 0, z: 0, f: {...blank(), t: "r"}}])).toBe("");
	});
});

describe("the one-cube rules through the block engine", () => {
	it("agree with tryMove on every campaign level", () => {
		const differences = LEVELS.flatMap((level) => {
			const out: string[] = [];
			const queue = [initState(level)];
			const seen = new Set(queue.map(stateKey));
			for (let i = 0; i < queue.length && i < 150; i++) {
				const st = queue[i]!;
				for (const d of ["N", "S", "E", "W"] as Direction[]) {
					const plain = tryMove(level, st, d);
					const block = tryMove(level, withUnits(st), d);
					const stripped = block.ok
						? {...block, st: {...block.st, units: undefined, loose: undefined}}
						: block;
					const expected = plain.ok
						? {...plain, st: {...plain.st, units: undefined, loose: undefined}}
						: plain;
					if (JSON.stringify(stripped) !== JSON.stringify(expected))
						out.push(`${level.name} ${stateKey(st)} ${d}`);
					if (plain.ok && !plain.won && !seen.has(stateKey(plain.st))) {
						seen.add(stateKey(plain.st));
						queue.push(plain.st);
					}
				}
			}
			return out;
		});
		expect(differences).toStrictEqual([]);
	});
});

describe("stateKey", () => {
	it("tells apart blocks with the same first cube", () => {
		const {level, state} = start(["S+..X"]);
		expect(stateKey(walk(level, state, "E"))).not.toBe(stateKey(state));
	});
});

describe("share codes", () => {
	it("carry loose cubes through a link", () => {
		const source = {name: "Pair", map: ["S+X"], k: CUBE};
		const code = encodeLevel(source);
		expect(decodeLevel(code)).toStrictEqual(source);
		expect(levelFromSearch("?" + code)).toStrictEqual(source);
	});

	it("reject a colored cube, which has no meaning", () => {
		const code = encodeLevel({name: "Pair", map: ["S+X"], k: {"+": ["cube", "r"]}} as unknown as LevelSource);
		expect(() => levelFromSearch("?" + code)).toThrow("bad");
	});
});

describe("MERGE_LEVELS", () => {
	const solved = MERGE_LEVELS.map((level) => ({level, path: solve(level, initState(level))}));

	it("has a shortest solution of exactly par on every level", () => {
		expect(solved.map(({path}) => path?.length)).toStrictEqual(MERGE_LEVELS.map((level) => level.par));
	});

	it("merges along every solution", () => {
		const merges = solved.map(({level, path}) => {
			let st = initState(level);
			let count = 0;
			for (const d of path!) {
				const r = step(level, st, d as Direction);
				if (r.merged) count++;
				st = r.st;
			}
			return count;
		});
		expect(merges).toStrictEqual([1, 2, 1, 7]);
	});

	it("runs from the easiest to the hardest, ending with the player's level Pride", () => {
		expect(MERGE_LEVELS.map((level) => [level.name, level.par])).toStrictEqual([
			["Stick Together", 4],
			["Mind the Gap", 5],
			["Side by Side", 9],
			["Pride", 17],
		]);
	});

	it("includes a level that a 1x3 crosses by hanging over a gap", () => {
		const gap = solved[1]!;
		let st = initState(gap.level);
		const hung = gap.path!.split("").some((d) => {
			st = step(gap.level, st, d as Direction).st;
			return st.units!.some((u) => u.z === 0 && !cellAt(gap.level, u.x, u.y));
		});
		expect([gap.level.name, hung]).toStrictEqual(["Mind the Gap", true]);
	});
});
