import {expect, it, vi} from "vite-plus/test";
import {infCandidate, infRng, infSearch} from "../../../src/core/infinite.ts";
import {solve} from "../../../src/core/solver.ts";

// No quick real seed needs more than 240 tries, so the solver is scripted to reject that many.
vi.mock("../../../src/core/solver.ts", () => (
{
	solve: vi.fn<typeof solve>(),
}));

it("after 240 failed tries it draws candidates from four levels earlier", () =>
{
	let calls = 0;
	// Try 241 solves, then its relaxed copy comes back unsolvable, so the walls count as mattering.
	vi.mocked(solve).mockImplementation(() => (++calls === 241 ? "E".repeat(20) : null));

	const seed = 5;
	const n = 14;
	const R = infRng(seed + n * 7919);
	for (let i = 0; i < 240; i++) infCandidate(R, n);
	const expected = infCandidate(R, n - 4);

	const batch = infSearch(seed, n);
	const batches = Array.from(
		{
			length: 40,
		},
		() => batch(),
	);
	const found = batch();

	expect(batches.every((level) => level === null)).toBe(true);
	expect(found).toStrictEqual(
		{
			map: expected.map,
			k: expected.k,
			need: expected.need,
			par: 20,
			name: "Canvas 15",
			inf: 14,
		},
	);
});
