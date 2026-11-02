import {type BrowserType, expect, test} from "@playwright/test";
import {readInfiniteGolden} from "../support/golden.ts";
import {BASE_URL, DIST_PATH} from "./harness/pair.ts";

const golden = readInfiniteGolden("infinite-post-fix.json");
const DEEP_CASES = [1, 4, 9, 77, 2024, 31337].flatMap((seed) => [6, 10, 15, 21, 27].map((n) => [seed, n]));
const CASES = [...golden.map(({seed, n}) => [seed, n]), ...DEEP_CASES];
const CANDIDATE_LEVEL_NUMBERS = [0, 2, 4, 6, 8, 10, 12, 14, 20, 33];

// A string, because genInf, run, infRng and infCandidate are lexical globals of the page rather than window properties.
const GENERATE = `(async () => {
	const levels = [];
	for (const [seed, n] of ${JSON.stringify(CASES)}) {
		run = { seed, n:0 };
		levels.push(await new Promise(resolve => genInf(n, lv => resolve(JSON.parse(JSON.stringify(lv))))));
	}
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
