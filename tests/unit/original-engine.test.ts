import {describe, expect, it} from "vitest";
import {loadOriginalEngine} from "../support/original-engine.ts";

describe("loadOriginalEngine", () => {
	const engine = loadOriginalEngine();

	it("exposes the 30 campaign levels in their original order", () => {
		expect(engine.LEVELS.length).toBe(30);
		expect([engine.LEVELS[0]?.name, engine.LEVELS[29]?.name]).toStrictEqual(["First Roll", "Clean Sweep"]);
	});

	it("runs the original solver", () => {
		const level = engine.parseLevel({map: ["S.X"]});
		expect(engine.solve(level, engine.initState(level))).toBe("EE");
	});

	it("reports a blocked move the way the original does", () => {
		const level = engine.parseLevel({map: ["S.X"]});
		expect(engine.tryMove(level, engine.initState(level), "W")).toStrictEqual({ok: false, why: "edge", nx: -1, ny: 0});
	});

	it("generates the same infinite level for the same seed", () => {
		expect(engine.generateInfinite(7, 0)).toStrictEqual(engine.generateInfinite(7, 0));
	});
});
