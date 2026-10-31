import {type Browser, expect, type Page, test} from "@playwright/test";
import {initState} from "../../src/core/level.ts";
import {MERGE_LEVELS} from "../../src/core/merge-levels.ts";
import {solve} from "../../src/core/solver.ts";
import type {Direction} from "../../src/core/types.ts";
import {atLevel, BASE_URL} from "./harness/pair.ts";

const KEYS: Record<Direction, string> = {N: "ArrowUp", S: "ArrowDown", E: "ArrowRight", W: "ArrowLeft"};
const unitPlaces = async (page: Page) => page.evaluate("S.st.units.map(u => [u.x, u.y, u.z])");
const settled = async (page: Page) => page.waitForFunction("!S.busy");

const open = async (browser: Browser, reducedMotion: "reduce" | "no-preference"): Promise<Page> => {
	const context = await browser.newContext({
		reducedMotion,
		storageState: {
			cookies: [],
			origins: [
				{
					origin: BASE_URL,
					localStorage: Object.entries(atLevel(0)).map(([name, value]) => ({name, value})),
				},
			],
		},
	});
	const page = await context.newPage();
	await page.goto(`${BASE_URL}/`);
	await page.locator("#titlePlay").click();
	return page;
};
const roll = async (page: Page, path: string): Promise<void> => {
	for (const d of path) {
		await page.keyboard.press(KEYS[d as Direction]);
		await settled(page);
	}
};

test("the three merge levels play through to the end, and record their best", async ({browser}) => {
	const page = await open(browser, "reduce");
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.locator('#levels button[title="Stick Together"]').click();
	for (const [index, level] of MERGE_LEVELS.entries()) {
		await expect(page.locator("#lvName")).toHaveText(level.name!);
		await expect(page.locator("#lvNum")).toHaveText(`Merge level ${index + 1} of 3`);
		await expect(page.locator(".cube")).toHaveCount(1 + level.cubes0!.length);
		await roll(page, solve(level, initState(level))!);
		await expect(page.locator("#win")).toBeVisible();
		await expect(page.locator("#winScore")).toHaveText(`${level.par} moves · par ${level.par}`);
		if (index < 2) await page.locator("#winNext").click();
	}
	await expect(page.locator("#winNext")).toBeHidden();
	await expect(page.locator("#winNote")).toHaveText(
		"That was the last merge level. Replay any of them to chase par.",
	);
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("cubist-progress-v2")!) as object);
	expect(saved).toStrictEqual({"Stick Together": 4, "Mind the Gap": 5, "Side by Side": 9});
	expect(errors).toStrictEqual([]);
	await page.close();
});

test("a press into a cube merges without moving, plays its animation, and undoes", async ({browser}) => {
	const page = await open(browser, "no-preference");
	await page.locator('#levels button[title="Stick Together"]').click();
	await page.keyboard.press("ArrowRight");
	await expect.poll(async () => page.evaluate("document.getAnimations().length")).toBeGreaterThan(0);
	await settled(page);
	await expect(page.locator("#status")).toContainText("Merged");
	expect(await unitPlaces(page)).toStrictEqual([
		[0, 0, 0],
		[1, 0, 0],
	]);
	await expect(page.locator("#moves")).toHaveText("1");
	await page.keyboard.press("ArrowRight");
	await settled(page);
	expect(await unitPlaces(page)).toStrictEqual([
		[2, 0, 1],
		[2, 0, 0],
	]);
	const c = await page.evaluate("C()");
	const transforms = await page
		.locator(".cube")
		.evaluateAll((els) => els.map((el) => (el as HTMLElement).style.transform));
	expect(transforms).toStrictEqual([1, 0].map((z) => `translate3d(${2 * Number(c)}px, 0px, ${z * Number(c) + 1}px)`));
	await page.locator("#undoBtn").click();
	await page.locator("#undoBtn").click();
	expect(await unitPlaces(page)).toStrictEqual([[0, 0, 0]]);
	await expect(page.locator(".cube")).toHaveCount(2);
	await page.close();
});

test("the panel lists each cube's own faces once merged", async ({browser}) => {
	const page = await open(browser, "reduce");
	await page.locator('#levels button[title="Side by Side"]').click();
	await roll(page, "EEES");
	await expect(page.locator("#needBox")).toContainText("Block of 2 cubes");
	await expect(page.locator("#needBox")).toContainText("Cube 1: red on bottom.");
	await expect(page.locator("#needBox")).toContainText("Cube 2: red on bottom.");
	await page.keyboard.press("ArrowDown");
	await settled(page);
	await page.keyboard.press("ArrowDown");
	await settled(page);
	await expect(page.locator("#needBox")).toContainText("Cube 1: red on top.");
	await page.close();
});

test("a misaligned block is told why it can't merge", async ({browser}) => {
	const page = await open(browser, "reduce");
	await page.locator('#levels button[title="Stick Together"]').click();
	await page.evaluate(`startLevel(parseLevel({name: "T", map: ["S+.", ".+."], k: {"+": ["cube", "w"]}}), -3)`);
	await roll(page, "E");
	await page.keyboard.press("ArrowDown");
	await expect(page.locator("#status")).toContainText("lined up");
	await page.close();
});

test("a hint on a merge level names the merge", async ({browser}) => {
	const page = await open(browser, "reduce");
	await page.locator('#levels button[title="Mind the Gap"]').click();
	await page.locator("#hintBtn").click();
	await expect(page.locator("#hintBox")).toContainText("merge with the highlighted cube");
	await page.close();
});
