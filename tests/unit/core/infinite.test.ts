import {readFileSync} from "node:fs";
import {describe, expect, it} from "vite-plus/test";
import {
	infCandidate,
	infRank,
	infRating,
	infRelaxed,
	infRng,
	infSearch,
	infTier,
	infTry,
} from "../../../src/core/infinite.ts";
import type {GeneratedLevel} from "../../../src/core/infinite.ts";
import type {InfiniteGolden} from "../../support/golden.ts";
import {loadOriginalEngine} from "../../support/original-engine.ts";

const golden = JSON.parse(
	readFileSync(new URL("../../golden/infinite.json", import.meta.url), "utf8"),
) as InfiniteGolden[];
const original = loadOriginalEngine();
const generate = (seed: number, n: number): GeneratedLevel => {
	const batch = infSearch(seed, n);
	for (;;) {
		const level = batch();
		if (level) return level;
	}
};

describe("infRng", () => {
	it("produces the original's stream for a seed", () => {
		const draw = (rng: () => number) => [rng(), rng(), rng(), rng()];
		expect(draw(infRng(12345))).toStrictEqual(draw(original.infRng(12345)));
	});

	it("produces known values, in [0, 1)", () => {
		const rng = infRng(0);
		expect([rng(), rng()]).toStrictEqual([0.26642920868471265, 0.0003297457005828619]);
	});
});

describe("infTier", () => {
	it("climbs every two levels and stops at 7", () => {
		expect([0, 1, 2, 3, 13, 14, 15, 100].map(infTier)).toStrictEqual([0, 0, 1, 1, 6, 7, 7, 7]);
	});
});

describe("infRelaxed", () => {
	it("turns gates and white gates to floor and keeps everything else", () => {
		expect(infRelaxed({map: ["SrRoOyYgGcCbBpPW12345Z X"], k: {"1": ["wgate", "t"]}})).toStrictEqual({
			map: ["Sr.o.y.g.c.b.p.......Z X"],
			k: {},
		});
	});
});

describe("infCandidate and infTry", () => {
	const levelNumbers = [0, 2, 4, 6, 8, 10, 12, 14, 20, 33];

	it("draws the same candidates as the original at every tier, for many draws", () => {
		const draw = (candidate: (R: () => number, n: number) => unknown, rng: (seed: number) => () => number) =>
			levelNumbers.flatMap((n) => {
				const R = rng(n + 1);
				return Array.from({length: 800}, () => candidate(R, n));
			});
		expect(draw(infCandidate, infRng)).toStrictEqual(draw(original.infCandidate, original.infRng));
	});

	it("accepts and rejects the same candidates as the original", () => {
		const draw = (attempt: (R: () => number, n: number) => unknown, rng: (seed: number) => () => number) =>
			[0, 4, 8].flatMap((n) => {
				const R = rng(n + 1);
				return Array.from({length: 8}, () => attempt(R, n));
			});
		const tried = draw(infTry, infRng);
		expect(tried).toStrictEqual(draw(original.infTry, original.infRng));
		expect(tried.some((level) => level === null)).toBe(true);
		expect(tried.some((level) => level !== null)).toBe(true);
	});
});

describe("infSearch", () => {
	it("generates what the original generates, across seeds and deep into a run", () => {
		const pairs = [
			[4, 8],
			[9, 10],
			[77, 15],
		] as const;
		const generated = pairs.map(([seed, n]) => JSON.parse(JSON.stringify(generate(seed, n))) as unknown);
		expect(generated).toStrictEqual(
			pairs.map(([seed, n]) => JSON.parse(JSON.stringify(original.generateInfinite(seed, n))) as unknown),
		);
	});

	it("generates every golden level from its seed", () => {
		const generated = golden.map(({seed, n}) => JSON.parse(JSON.stringify(generate(seed, n))) as unknown);
		expect(generated).toStrictEqual(golden.map((entry) => entry.level));
	});

	it("names and numbers what it generates, and keeps an unset need as a key", () => {
		const level = generate(1, 0);
		expect(Object.keys(level)).toStrictEqual(["map", "k", "need", "par", "name", "inf"]);
		expect([level.name, level.inf, level.need]).toStrictEqual(["Canvas 1", 0, undefined]);
	});

	it("reports an empty batch with null so the caller can yield and try again", () => {
		const batch = infSearch(54, 2);
		const first = batch();
		const second = batch();
		expect(first).toBe(null);
		expect(JSON.parse(JSON.stringify(second))).toStrictEqual(
			JSON.parse(JSON.stringify(original.generateInfinite(54, 2))),
		);
	});
});

describe("infRating", () => {
	it("is 0 with no history", () => {
		expect(infRating({effs: []})).toBe(0);
	});

	it("rounds the average to a percentage", () => {
		expect(infRating({effs: [1, 0.5, 0.75]})).toBe(75);
		expect(infRating({effs: [1, 0.9, 0.85]})).toBe(92);
	});

	it("only counts the last ten", () => {
		expect(infRating({effs: [0, 0, 0, ...Array<number>(10).fill(1)]})).toBe(100);
	});

	it("counts the tenth from last", () => {
		expect(infRating({effs: [0, ...Array<number>(9).fill(1)]})).toBe(90);
	});
});

describe("infRank", () => {
	it("is Unranked below three canvases, whatever the rating", () => {
		expect([infRank({effs: []}), infRank({effs: [1, 1]})]).toStrictEqual(["Unranked", "Unranked"]);
	});

	it.each([
		[1, "Grandmaster"],
		[0.99, "Grandmaster"],
		[0.98, "Master"],
		[0.95, "Master"],
		[0.94, "Artist"],
		[0.9, "Artist"],
		[0.89, "Painter"],
		[0.82, "Painter"],
		[0.81, "Sketcher"],
		[0.72, "Sketcher"],
		[0.71, "Doodler"],
		[0.6, "Doodler"],
		[0.59, "Smudger"],
		[0, "Smudger"],
	])("an average of %d ranks %s", (eff, rank) => {
		expect(infRank({effs: [eff, eff, eff]})).toBe(rank);
	});
});
