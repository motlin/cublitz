import {readFileSync} from "node:fs";
import {describe, expect, it} from "vite-plus/test";
import {generateInfiniteGolden, generateSolveGolden} from "../support/golden.ts";
import {loadOriginalEngine} from "../support/original-engine.ts";

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../golden/${name}`, import.meta.url), "utf8"));

describe("golden files generated from the original script", () => {
	const engine = loadOriginalEngine();

	it("solve() results for all 30 levels", () => {
		expect(generateSolveGolden(engine)).toStrictEqual(read("solve.json"));
	});

	it("infinite levels for several seeds and level numbers", () => {
		expect(generateInfiniteGolden(engine)).toStrictEqual(read("infinite.json"));
	});
});
