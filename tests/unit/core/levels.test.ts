import {readFileSync} from "node:fs";
import {describe, expect, it} from "vite-plus/test";
import {initState} from "../../../src/core/level.ts";
import {LEVELS} from "../../../src/core/levels.ts";
import {solve} from "../../../src/core/solver.ts";
import type {SolveGolden} from "../../support/golden.ts";
import {loadExpectedEngine} from "../../support/original-engine.ts";

const golden = JSON.parse(readFileSync(new URL("../../golden/solve.json", import.meta.url), "utf8")) as SolveGolden[];

describe("LEVELS", () => {
	const solved = LEVELS.map((level, index) => {
		const path = solve(level, initState(level));
		return {
			index,
			name: level.name ?? "",
			par: level.par ?? null,
			path,
			hitLimit: solve.hitLimit,
		};
	});

	it("is the original's data, parsed, in the same order and with the same key order", () => {
		expect(JSON.stringify(LEVELS)).toBe(JSON.stringify(loadExpectedEngine().LEVELS));
	});

	it("solves every level to the golden result", () => {
		expect(solved).toStrictEqual(golden);
	});

	it("has a shortest solution of exactly par on every level", () => {
		expect(solved.map((entry) => entry.path?.length)).toStrictEqual(LEVELS.map((level) => level.par));
	});
});
