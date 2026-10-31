import {readFileSync} from "node:fs";
import {describe, expect, it} from "vite-plus/test";
import {generateInfiniteGolden, generateSolveGolden} from "../support/golden.ts";
import {loadExpectedEngine, loadOriginalEngine} from "../support/original-engine.ts";
import {onPinnedNode} from "../support/pinned-node.ts";

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../golden/${name}`, import.meta.url), "utf8"));

describe("golden files generated from the original script", () => {
	const engine = loadOriginalEngine();

	it("solve() results for all 30 levels", () => {
		expect(generateSolveGolden(engine)).toStrictEqual(read("solve.json"));
	});

	it.runIf(onPinnedNode)("infinite levels for several seeds and level numbers", () => {
		expect(generateInfiniteGolden(engine)).toStrictEqual(read("infinite.json"));
	});

	it("infinite levels with the intentional divergences applied, in a separate file", () => {
		expect(generateInfiniteGolden(loadExpectedEngine())).toStrictEqual(read("infinite-post-fix.json"));
	});
});
