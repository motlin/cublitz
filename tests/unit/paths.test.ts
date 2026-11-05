import {describe, expect, it} from "vite-plus/test";
import {engine} from "../support/engine.ts";
import {findBlockedMove, findDeadEnd, keyFor} from "../support/paths.ts";

describe("findBlockedMove", () =>
{
	it("returns the moves that reach a blocked roll of the requested kind", () =>
	{
		const level = engine.parseLevel(
			{
				map: ["S.RX"],
			},
		);
		expect(findBlockedMove(engine, level, "gate")).toStrictEqual(
			{
				path: "E",
				dir: "E",
			},
		);
	});

	it("returns null when no reachable state blocks that way", () =>
	{
		const level = engine.parseLevel(
			{
				map: ["S.X"],
			},
		);
		expect(findBlockedMove(engine, level, "door")).toBe(null);
	});
});

describe("findDeadEnd", () =>
{
	it("finds the shortest path into a position the solver cannot finish", () =>
	{
		const level = engine.parseLevel(
			{
				map: ["S.r.WX"],
			},
		);
		expect(findDeadEnd(engine, level)).toBe(null);
		const trap = engine.parseLevel(
			{
				map: ["Sr..", "...X"],
				need:
				{
					t: "b",
				},
			},
		);
		expect(findDeadEnd(engine, trap)).toBe("");
	});
});

describe("keyFor", () =>
{
	it("maps every direction to its arrow key", () =>
	{
		expect(["N", "S", "E", "W"].map(keyFor)).toStrictEqual(["ArrowUp", "ArrowDown", "ArrowRight", "ArrowLeft"]);
	});
});
