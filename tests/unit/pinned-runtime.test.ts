import {readFileSync} from "node:fs";
import {expect, it} from "vite-plus/test";

// The original's infCandidate sorts with a random comparator, whose result depends on the JS engine and how far it has
// optimized the sort: the same seed gives different levels on different V8 versions. So tests/golden/infinite.json only
// holds on the pinned Node, and any failures beside this one on another Node say nothing about the code.
it("runs on the pinned Node, which the original's generated-level golden depends on", () => {
	const config = readFileSync(new URL("../../.mise/config.toml", import.meta.url), "utf8");
	expect(process.version).toBe(`v${/^node = "(.*)"$/m.exec(config)?.[1]}`);
});
