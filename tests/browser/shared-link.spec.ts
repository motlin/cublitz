import {type Browser, expect, type Page, test} from "@playwright/test";
import {parseLevel, initState} from "../../src/core/level.ts";
import {encodeLevel} from "../../src/core/share.ts";
import {solve} from "../../src/core/solver.ts";
import type {Direction} from "../../src/core/types.ts";
import {atLevel, BASE_URL, engine} from "./harness/pair.ts";

const FLIP =
	"?CUBLITZ:eyJuYW1lIjoiRmxpcCBpdCBhbmQgcmV2ZXJzZSBpdCIsIm1hcCI6WyIuLnJveS4uLllPUlgiLCJTLnJveS4uLllPUlgiLCIuLnJveS4uLllPUlgiXSwiayI6e319";
const KEYS: Record<Direction, string> = {N: "ArrowUp", S: "ArrowDown", E: "ArrowRight", W: "ArrowLeft"};
const BAD_LINK = "This level link didn’t work. It may be incomplete, so ask for a new one.";

const open = async (browser: Browser, search: string): Promise<{page: Page; errors: string[]}> => {
	const context = await browser.newContext({
		reducedMotion: "reduce",
		storageState: {
			cookies: [],
			origins: [
				{
					origin: BASE_URL,
					localStorage: Object.entries(atLevel(1)).map(([name, value]) => ({name, value})),
				},
			],
		},
	});
	const page = await context.newPage();
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${BASE_URL}/${search}`);
	return {page, errors};
};

test("a share code in the query opens the level, with a par the game worked out", async ({browser}) => {
	const {page, errors} = await open(browser, FLIP);
	await expect(page.locator("#playView")).toBeVisible();
	await expect(page.locator("#titleView")).toBeHidden();
	await expect(page.locator("#lvName")).toHaveText("Flip it and reverse it");
	await expect(page.locator("#lvNum")).toHaveText("Shared level");
	await expect(page.locator("#lvTip")).toHaveText("Someone shared this level with you.");
	await expect(page.locator("#backEdit")).toBeHidden();
	const level = parseLevel({name: "Flip", map: ["..roy...YORX", "S.roy...YORX", "..roy...YORX"], k: {}});
	const solution = solve(level, initState(level), 600000)!;
	await expect(page.locator("#par")).toHaveText(String(solution.length));
	expect(errors).toStrictEqual([]);
	await page.close();
});

test("winning a shared level saves no progress and leads into the campaign", async ({browser}) => {
	const {page} = await open(browser, FLIP);
	const before = await page.evaluate(() => localStorage.getItem("cubist-progress-v2"));
	const level = parseLevel({map: ["..roy...YORX", "S.roy...YORX", "..roy...YORX"], k: {}});
	for (const direction of solve(level, initState(level), 600000)!) {
		await page.keyboard.press(KEYS[direction as Direction]);
		await page.waitForTimeout(20);
	}
	await expect(page.locator("#win")).toBeVisible();
	await expect(page.locator("#winNote")).toHaveText("You cleared a shared level. Keep rolling in the main game.");
	await expect(page.locator("#winNext")).toContainText("Play the game");
	expect(await page.evaluate(() => localStorage.getItem("cubist-progress-v2"))).toBe(before);
	await page.locator("#winNext").click();
	await expect(page.locator("#lvNum")).toHaveText(`Level 2 of ${engine.LEVELS.length}`);
	await page.close();
});

test("a shared level with a + in its code survives the address bar", async ({browser}) => {
	const code = encodeLevel({name: "a>>>?", map: ["S.X"], k: {}});
	expect(code).toContain("+");
	const {page} = await open(browser, `?${code}`);
	await expect(page.locator("#lvName")).toHaveText("a>>>?");
	await page.close();
});

test("remixing a shared level leaves the player's saved level alone", async ({browser}) => {
	const {page} = await open(browser, FLIP);
	await page.locator("#editCopy").click();
	await expect(page.locator("#editView")).toBeVisible();
	await expect(page.locator("#edName")).toHaveValue("Flip it and reverse it remix");
	await expect(page.locator("#edSave")).toHaveText("Save to my levels");
	await page.close();
});

for (const [name, search] of [
	["a code that is not base64", "?CUBLITZ:%%%"],
	["a code cut short", FLIP.slice(0, 30)],
	[
		"markup in a legend color",
		`?CUBLITZ:${btoa(JSON.stringify({name: "x", map: ["S1X"], k: {1: ["door", "<img src=x onerror=window.pwned=1>"]}}))}`,
	],
	["a level with no start", `?CUBLITZ:${btoa(JSON.stringify({name: "x", map: ["..X"], k: {}}))}`],
] as const) {
	test(`a link with ${name} explains itself on the title screen`, async ({browser}) => {
		const {page, errors} = await open(browser, search);
		await expect(page.locator("#titleView")).toBeVisible();
		await expect(page.locator("#shareError")).toHaveText(BAD_LINK);
		await expect(page.locator("#shareError")).toBeVisible();
		await expect(page.locator("#shareError")).toHaveAttribute("role", "alert");
		expect(await page.evaluate(() => "pwned" in window)).toBe(false);
		expect(errors).toStrictEqual([]);
		await page.close();
	});
}

test("an unrelated query leaves the title screen as it always was", async ({browser}) => {
	const {page} = await open(browser, "?utm_source=mail");
	await expect(page.locator("#titleView")).toBeVisible();
	await expect(page.locator("#shareError")).toHaveCount(0);
	await page.close();
});
