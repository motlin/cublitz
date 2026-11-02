import {expect, it} from "vite-plus/test";
import {pinnedNodeVersion} from "../support/pinned-node.ts";

// The original's infCandidate sorts with a random comparator, whose result depends on the JS engine and how far it has
// optimized the sort: the same seed gives different levels on different V8 versions. So tests/golden/infinite.json only
// holds on the pinned Node. Local runs skip that golden on another Node; CI must never skip it, so CI enforces the pin.
it.runIf(process.env["CI"])(
	"runs on the pinned Node in CI, so the original's generated-level golden is never skipped",
	() =>
	{
		expect(process.version).toBe(pinnedNodeVersion);
	},
);
