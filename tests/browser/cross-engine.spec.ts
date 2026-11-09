import {type BrowserType, expect, test} from "@playwright/test";
import {readInfiniteGolden} from "../support/golden.ts";
import {BASE_URL, DIST_PATH} from "./harness/page.ts";

const golden = readInfiniteGolden("infinite-post-fix.json");
// Two seeds at each depth, picked for a short search: some seeds take seconds to find a level at depth 21 or 27,
// and three engines searching at once made this the suite's longest test.
const DEEP_CASES = [
	[2024, 6],
	[31337, 6],
	[4, 10],
	[31337, 10],
	[77, 15],
	[9, 15],
	[4, 21],
	[31337, 21],
	[2024, 27],
	[1, 27],
];
const CASES = [...golden.map(({seed, n}) => [seed, n]), ...DEEP_CASES];
const CANDIDATE_LEVEL_NUMBERS = [0, 2, 4, 6, 8, 10, 12, 14, 20, 33];

// A string, because it imports the game's generator in the page from the test server's copy of src/core/.
const GENERATE = `(async () => {
	const {infCandidate, infRng, infSearch} = await import("/src/core/infinite.ts");
	const levels = ${JSON.stringify(CASES)}.map(([seed, n]) => {
		const next = infSearch(seed, n);
		for (;;) {
			const level = next();
			if (level) return JSON.parse(JSON.stringify(level));
		}
	});
	const candidates = ${JSON.stringify(CANDIDATE_LEVEL_NUMBERS)}.map(n => {
		const R = infRng(n + 1);
		return Array.from({length: 300}, () => infCandidate(R, n));
	});
	return {levels, candidates};
})()`;

const generateIn = async (
	engine: BrowserType,
): Promise<
{
	levels: unknown[];
	candidates: unknown[];
}> =>
{
	// The config's launch args are Chromium's, and Linux WebKit refuses to start on an option it does not know.
	const browser = await engine.launch(
		{
			args: [],
		},
	);
	try
	{
		const context = await browser.newContext();
		await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => route.abort());
		const page = await context.newPage();
		await page.goto(BASE_URL + DIST_PATH);
		return await page.evaluate(GENERATE);
	}
	finally
	{
		await browser.close();
	}
};

test("one seed generates the same levels in Chromium, Firefox and WebKit", async ({playwright}) =>
{
	const [chromium, firefox, webkit] = await Promise.all(
		[playwright.chromium, playwright.firefox, playwright.webkit].map(generateIn),
	);
	expect(
		{
			firefox,
			webkit,
		},
	).toStrictEqual(
		{
			firefox: chromium,
			webkit: chromium,
		},
	);
	expect(chromium?.levels.slice(0, golden.length)).toStrictEqual(golden.map(({level}) => level));
});
