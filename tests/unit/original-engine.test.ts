import {describe, expect, it} from "vite-plus/test";
import {loadOriginalEngine} from "../support/original-engine.ts";

describe("loadOriginalEngine", () =>
{
	const engine = loadOriginalEngine();

	it("exposes the 30 campaign levels in their original order", () =>
	{
		expect(engine.LEVELS.length).toBe(30);
		expect([engine.LEVELS[0]?.name, engine.LEVELS[29]?.name]).toStrictEqual(["First Roll", "Clean Sweep"]);
	});

	it("runs the original solver", () =>
	{
		const level = engine.parseLevel(
			{
				map: ["S.X"],
			},
		);
		expect(engine.solve(level, engine.initState(level))).toBe("EE");
	});

	it("reports a blocked move the way the original does", () =>
	{
		const level = engine.parseLevel(
			{
				map: ["S.X"],
			},
		);
		expect(engine.tryMove(level, engine.initState(level), "W")).toStrictEqual(
			{
				ok: false,
				why: "edge",
				nx: -1,
				ny: 0,
			},
		);
	});

	it("generates the same infinite level for the same seed", () =>
	{
		expect(engine.generateInfinite(7, 0)).toStrictEqual(engine.generateInfinite(7, 0));
	});

	it("exposes the rest of the pure code the modules are compared against", () =>
	{
		const level = engine.parseLevel(
			{
				map: ["S.X"],
			},
		);
		const start = engine.initState(level);
		const milestone = engine.nextMilestone(level, start, "EE");
		if (!milestone) throw new Error("expected a milestone");
		expect(
			{
				faces: engine.roll(
					{
						t: "r",
						b: "",
						n: "",
						s: "",
						e: "",
						w: "",
					},
					"E",
				),
				solid: engine.solidColor(
					{
						t: "r",
						b: "r",
						n: "r",
						s: "r",
						e: "r",
						w: "r",
					},
				),
				work: engine.workColor(start.f),
				open: engine.openColors(level, start),
				key: engine.stateKey(start),
				hint: engine.hintTexts(level, start, milestone),
				code: engine.encodeLevel(
					{
						map: ["S"],
					},
				),
				decoded: engine.decodeLevel("CUBLITZ:eyJtYXAiOlsiUyJdfQ=="),
				rating: engine.infRating(
					{
						effs: [1, 0.5],
					},
				),
				rank: engine.infRank(
					{
						effs: [1, 1, 1],
					},
				),
			},
		).toStrictEqual(
			{
				faces:
				{
					t: "",
					e: "r",
					b: "",
					w: "",
					n: "",
					s: "",
				},
				solid: "r",
				work: "w",
				open: {},
				key: "0,0,------,,",
				hint: ["Head for the target.", "Arrive rolling east. Nothing else is required."],
				code: "CUBLITZ:eyJtYXAiOlsiUyJdfQ==",
				decoded:
				{
					map: ["S"],
				},
				rating: 75,
				rank: "Grandmaster",
			},
		);
	});
});
