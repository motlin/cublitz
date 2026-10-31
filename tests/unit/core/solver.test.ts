import {describe, expect, it} from "vitest";
import {initState, parseLevel} from "../../../src/core/level.ts";
import {solve} from "../../../src/core/solver.ts";

const solveMap = (map: string[], limit?: number) => {
	const level = parseLevel({map});
	const path = solve(level, initState(level), limit);
	return {path, hitLimit: solve.hitLimit};
};

describe("solve", () => {
	it("finds the shortest path", () => {
		expect(solveMap(["S.X"])).toStrictEqual({path: "EE", hitLimit: false});
	});

	it("breaks ties in N, S, E, W order", () => {
		expect(solveMap([".X", "S."])).toStrictEqual({path: "NE", hitLimit: false});
		expect(solveMap(["S.", ".X"])).toStrictEqual({path: "SE", hitLimit: false});
	});

	it("returns null without hitting the limit when there is no way through", () => {
		expect(solveMap(["S X"])).toStrictEqual({path: null, hitLimit: false});
	});

	it("returns null and sets hitLimit when the search reaches the limit", () => {
		expect(solveMap(["S...X"], 2)).toStrictEqual({path: null, hitLimit: true});
	});

	it("checks the limit against states seen before each expansion", () => {
		expect(solveMap(["S.X"], 1)).toStrictEqual({path: null, hitLimit: true});
		expect(solveMap(["S.X"], 3)).toStrictEqual({path: "EE", hitLimit: false});
	});

	it("clears hitLimit on the next call", () => {
		solveMap(["S...X"], 2);
		expect(solveMap(["SX"])).toStrictEqual({path: "E", hitLimit: false});
	});

	it("walks past a target it cannot yet win on", () => {
		const level = parseLevel({map: ["SXr"], need: {e: "r"}});
		expect(solve(level, initState(level))).toBe("EEW");
	});
});
