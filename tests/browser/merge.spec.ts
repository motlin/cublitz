import {type Browser, expect, type Page, test} from "@playwright/test";
import {initState, parseLevel} from "../../src/core/level.ts";
import {MERGE_LEVELS} from "../../src/core/merge-levels.ts";
import {solve} from "../../src/core/solver.ts";
import type {Direction, LevelSource} from "../../src/core/types.ts";
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

test("the four merge levels play through to the end, and record their best", async ({browser}) => {
	const page = await open(browser, "reduce");
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.locator('#levels button[title="Stick Together"]').click();
	for (const [index, level] of MERGE_LEVELS.entries()) {
		await expect(page.locator("#lvName")).toHaveText(level.name!);
		await expect(page.locator("#lvNum")).toHaveText(`Merge level ${index + 1} of 4`);
		await expect(page.locator("#lvTip")).toHaveText(level.tip ?? "");
		await expect(page.locator(".cube")).toHaveCount(1 + level.cubes0!.length);
		await roll(page, solve(level, initState(level))!);
		await expect(page.locator("#win")).toBeVisible();
		await expect(page.locator("#winScore")).toHaveText(`${level.par} moves · par ${level.par}`);
		if (index < 3) await page.locator("#winNext").click();
	}
	await expect(page.locator("#winNext")).toBeHidden();
	await expect(page.locator("#winNote")).toHaveText(
		"That was the last merge level. Replay any of them to chase par.",
	);
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("cubist-progress-v2")!) as object);
	expect(saved).toStrictEqual({"Stick Together": 4, "Mind the Gap": 5, "Side by Side": 9, Pride: 17});
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

const roundedMatrix = (matrix: number[]): number[] => matrix.map((value) => Math.round(value * 100) / 100 + 0);

/** Presses a refused key, freezes the tilt midway, and returns how each animated cube moves in board coordinates. */
const frozenTilt = async (
	page: Page,
	key: string,
	hinge: [number, number],
): Promise<{pivoted: number[]; moved: number[]}[]> =>
	page.evaluate(
		([pressedKey, pivotX, pivotY]) => {
			document.dispatchEvent(new KeyboardEvent("keydown", {key: pressedKey, bubbles: true}));
			const translate = (x: number, y: number, z: number): DOMMatrix => new DOMMatrix().translate(x, y, z);
			const asArray = (matrix: DOMMatrix): number[] => Array.from(matrix.toFloat64Array());
			const tilts = document
				.getAnimations()
				.filter(
					(animation) => ((animation.effect as KeyframeEffect).target as HTMLElement).className === "roller",
				);
			const samples = tilts.map((animation) => {
				animation.pause();
				animation.currentTime = 110;
				const roller = (animation.effect as KeyframeEffect).target as HTMLElement;
				const style = getComputedStyle(roller);
				const rotation = new DOMMatrix(style.transform);
				// The computed origin leaves out a z of zero
				const [originX = 0, originY = 0, originZ = 0] = style.transformOrigin.split(" ").map(parseFloat);
				const place = new DOMMatrix(roller.parentElement!.style.transform);
				const moved = place
					.multiply(translate(originX, originY, originZ))
					.multiply(rotation)
					.multiply(translate(-originX, -originY, -originZ))
					.multiply(place.inverse());
				const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--c"));
				const pivot = translate(pivotX * size, pivotY * size, 1);
				return {
					pivoted: asArray(pivot.multiply(rotation).multiply(pivot.inverse())),
					moved: asArray(moved),
				};
			});
			tilts.forEach((animation) => {
				animation.finish();
			});
			return samples;
		},
		[key, ...hinge] as const,
	);

/** Each pivot is the cell coordinate of the bottom edge the block should hinge on when that direction is refused. */
const REFUSED_TILTS: {
	name: string;
	map: string[];
	setup: string;
	cubes: number;
	pivots: Partial<Record<Direction, [number, number]>>;
}[] = [
	{
		name: "a 1x2 block lying east-west",
		map: ["S+"],
		setup: "E",
		cubes: 2,
		pivots: {E: [2, 0], W: [0, 0], N: [0, 0], S: [0, 1]},
	},
	{
		name: "a 1x3 block lying east-west",
		map: ["S++"],
		setup: "EE",
		cubes: 3,
		pivots: {E: [3, 0], W: [0, 0], N: [0, 0], S: [0, 1]},
	},
	{
		name: "a 1x2 block lying north-south",
		map: ["S", "+"],
		setup: "S",
		cubes: 2,
		pivots: {E: [1, 0], W: [0, 0], N: [0, 0], S: [0, 2]},
	},
	{
		name: "a 1x3 block lying north-south",
		map: ["S", "+", "+"],
		setup: "SS",
		cubes: 3,
		pivots: {E: [1, 0], W: [0, 0], N: [0, 0], S: [0, 3]},
	},
	{
		name: "a 1x2 block standing up",
		map: ["S+."],
		setup: "EE",
		cubes: 2,
		pivots: {E: [3, 0], N: [2, 0], S: [2, 1]},
	},
	{
		name: "a 1x3 block standing up",
		map: ["S++."],
		setup: "EEE",
		cubes: 3,
		pivots: {E: [4, 0], N: [3, 0], S: [3, 1]},
	},
	{
		name: "a 1x2 block beside a loose cube",
		map: ["S+", "  ", "+ "],
		setup: "E",
		cubes: 2,
		pivots: {E: [2, 0], W: [0, 0], N: [0, 0], S: [0, 1]},
	},
];

for (const {name, map, setup, cubes, pivots} of REFUSED_TILTS) {
	test(`a refused move tilts ${name} as one rigid piece`, async ({browser}) => {
		const page = await open(browser, "no-preference");
		await page.locator('#levels button[title="Stick Together"]').click();
		await page.evaluate(
			`startLevel(parseLevel({name: "T", map: ${JSON.stringify(map)}, k: {"+": ["cube", "w"]}}), -3)`,
		);
		await roll(page, setup);
		const rest = await unitPlaces(page);
		for (const [direction, pivot] of Object.entries(pivots)) {
			const samples = await frozenTilt(page, KEYS[direction as Direction], pivot);
			await settled(page);
			const expected = samples.map(({pivoted}) => roundedMatrix(pivoted));
			expect({direction, moved: samples.map(({moved}) => roundedMatrix(moved))}).toStrictEqual({
				direction,
				moved: expected,
			});
			expect(samples.length).toBe(cubes);
			expect(expected[0]).not.toStrictEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
			expect(await unitPlaces(page)).toStrictEqual(rest);
		}
		await page.close();
	});
}

const cell = (x: number, y: number) => `#edGrid [data-x="${x}"][data-y="${y}"]`;
const decode = (code: string): LevelSource =>
	JSON.parse(Buffer.from(code.replace("CUBLITZ:", ""), "base64").toString()) as LevelSource;
const BUILT = {
	name: "My Merge",
	map: ["........", "........", "S1.....X", "........", "........"],
	k: {1: ["cube", "w"]},
};

test("a merge level built in the editor checks, tests, saves and shares", async ({browser}) => {
	const page = await open(browser, "reduce");
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.locator("#modeEdit").click();
	await page.locator("#edName").fill("My Merge");
	await page.locator('#edTools [data-tool="cube"]').click();
	await page.locator(cell(1, 2)).click();
	await expect(page.locator(`${cell(1, 2)}.loose`)).toHaveCount(1);
	const code = await page.locator("#edCode").inputValue();
	expect(decode(code)).toStrictEqual(BUILT);

	const level = parseLevel(decode(code));
	const path = solve(level, initState(level))!;
	await page.locator("#edCheck").click();
	await expect(page.locator("#edResult")).toHaveText(`Solvable in ${path.length} moves. That becomes the par.`);

	await page.locator("#edTest").click();
	await expect(page.locator(".cube")).toHaveCount(2);
	await expect(page.locator("#lvTip")).toHaveText("Testing a level from the editor.");
	await roll(page, path);
	await expect(page.locator("#win")).toBeVisible();
	await page.locator("#winNext").click();

	await page.locator("#edSave").click();
	const saved = await page.evaluate(
		() => JSON.parse(localStorage.getItem("cubist-my-levels-v1")!) as {level: LevelSource}[],
	);
	expect(saved.map((entry) => entry.level)).toStrictEqual([BUILT]);
	await page.locator("#edNew").click();
	await expect(page.locator("#edGrid .loose")).toHaveCount(0);
	await page.locator('#edList [data-act="edit"]').click();
	await expect(page.locator(`${cell(1, 2)}.loose`)).toHaveCount(1);
	await page.locator('#edList [data-act="play"]').click();
	await expect(page.locator(".cube")).toHaveCount(2);
	await expect(page.locator("#lvName")).toHaveText("My Merge");

	await page.goto(`${BASE_URL}/?${code}`);
	await expect(page.locator(".cube")).toHaveCount(2);
	await roll(page, path);
	await expect(page.locator("#win")).toBeVisible();
	expect(errors).toStrictEqual([]);
	await page.close();
});

test("edit a copy of a merge level keeps its loose cubes", async ({browser}) => {
	const page = await open(browser, "reduce");
	await page.locator('#levels button[title="Mind the Gap"]').click();
	await page.locator("#editCopy").click();
	await expect(page.locator("#edName")).toHaveValue("Mind the Gap remix");
	await expect(page.locator("#edGrid .loose")).toHaveCount(2);
	expect(decode(await page.locator("#edCode").inputValue())).toStrictEqual({
		name: "Mind the Gap remix",
		map: ["S11.. .X"],
		k: {1: ["cube", "w"]},
	});
	await page.locator("#edTest").click();
	await expect(page.locator(".cube")).toHaveCount(3);
	await page.close();
});

test("a hint on a merge level names the merge", async ({browser}) => {
	const page = await open(browser, "reduce");
	await page.locator('#levels button[title="Mind the Gap"]').click();
	await page.locator("#hintBtn").click();
	await expect(page.locator("#hintBox")).toContainText("merge with the highlighted cube");
	await page.close();
});

test("a gate hint on a block clears once the block rolls through the gate", async ({browser}) => {
	const page = await open(browser, "reduce");
	await page.locator('#levels button[title="Side by Side"]').click();
	await roll(page, "EEESSSS");
	await page.locator("#hintBtn").click();
	await expect(page.locator("#hintBox")).toContainText("Your next goal is the highlighted red gate.");
	await roll(page, "S");
	await expect(page.locator("#hintBox")).toBeHidden();
	await expect(page.locator("#status")).toContainText("That was the hinted step.");
	await page.close();
});

test("Edit then Play resumes a merge level with its moves intact", async ({browser}) => {
	const page = await open(browser, "reduce");
	await page.locator('#levels button[title="Side by Side"]').click();
	await roll(page, "EE");
	const before = await unitPlaces(page);
	await page.locator("#modeEdit").click();
	await page.locator("#modePlay").click();
	await expect(page.locator("#lvName")).toHaveText("Side by Side");
	await expect(page.locator("#lvNum")).toHaveText("Merge level 3 of 4");
	await expect(page.locator("#moves")).toHaveText("2");
	expect(await unitPlaces(page)).toStrictEqual(before);
	await page.close();
});

const shadowPlaces = async (page: Page) =>
	page
		.locator(".shadow")
		.evaluateAll((els) => els.map((el) => [(el as HTMLElement).style.transform, (el as HTMLElement).hidden]));
const shadowAt = (c: number, x: number, y: number) => `translate3d(${x * c + 4}px, ${y * c + 6}px, 0.5px)`;

test("each cube's shadow heads for that cube's own landing while the block rolls", async ({browser}) => {
	const page = await open(browser, "no-preference");
	await page.locator('#levels button[title="Stick Together"]').click();
	await page.evaluate(`startLevel(parseLevel({name: "T", map: ["+S", ".."], k: {"+": ["cube", "w"]}}), -3)`);
	await roll(page, "W");
	const c = Number(await page.evaluate("C()"));
	const during = await page.evaluate(() => {
		document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}));
		return Array.from(document.querySelectorAll<HTMLElement>(".shadow")).map((el) => [
			el.style.transform,
			el.hidden,
		]);
	});
	expect(during).toStrictEqual([
		[shadowAt(c, 1, 1), false],
		[shadowAt(c, 0, 1), false],
	]);
	await settled(page);
	expect(await shadowPlaces(page)).toStrictEqual(during);
	await page.close();
});

test("merging a cube that is not first among the loose ones keeps every cube's look in place", async ({browser}) => {
	const page = await open(browser, "no-preference");
	await page.locator('#levels button[title="Stick Together"]').click();
	await page.evaluate(`startLevel(parseLevel({name: "T", map: ["S.+", "+.."], k: {"+": ["cube", "w"]}}), -3)`);
	const cubePlaces = async () =>
		page.locator(".cube").evaluateAll((els) => els.map((el) => (el as HTMLElement).style.transform));
	const cubesBefore = await cubePlaces();
	const shadowsBefore = await shadowPlaces(page);
	await roll(page, "S");
	expect(await unitPlaces(page)).toStrictEqual([
		[0, 0, 0],
		[0, 1, 0],
	]);
	expect({cubes: await cubePlaces(), shadows: await shadowPlaces(page)}).toStrictEqual({
		cubes: cubesBefore,
		shadows: shadowsBefore,
	});
	await page.locator("#undoBtn").click();
	expect({cubes: await cubePlaces(), shadows: await shadowPlaces(page)}).toStrictEqual({
		cubes: cubesBefore,
		shadows: shadowsBefore,
	});
	await page.close();
});
