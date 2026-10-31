import {readFileSync} from "node:fs";
import {expect, test} from "@playwright/test";
import type {SolveGolden} from "../support/golden.ts";
import {atLevel, engine, type Pair, withPair} from "./harness/pair.ts";

// Behavior a session never reaches on its own, so each one is driven here on purpose.

const golden = JSON.parse(readFileSync(new URL("../golden/solve.json", import.meta.url), "utf8")) as SolveGolden[];

const ROLL_KEYS = ["w", "a", "s", "d", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];

for (const modifier of ["Meta", "Control", "Alt"]) {
	test(`game keys with ${modifier} held do nothing`, async ({browser}) => {
		await withPair(browser, {storage: atLevel(1)}, async (pair) => {
			await pair.click("#titlePlay");
			for (const key of ROLL_KEYS) {
				const pressed = await pair.press(`${modifier}+${key}`);
				expect({moves: pressed.hud.moves, prevented: pressed.prevented}).toStrictEqual({moves: "0", prevented: []});
			}
		});
	});

	test(`the M key with ${modifier} held leaves the sound alone`, async ({browser}) => {
		await withPair(browser, {storage: atLevel(1)}, async (pair) => {
			const pressed = await pair.press(`${modifier}+m`);
			expect(pressed.storage).toStrictEqual(atLevel(1));
		});
	});
}

const SAVED_KEYS = [
	"cubist-progress-v2",
	"cubist-tips-seen-v1",
	"cubist-editor-draft-v1",
	"cubist-my-levels-v1",
	"cubist-colors-v1",
	"cubist-sound-v1",
	"cublitz-infinite-run-v1",
	"cublitz-infinite-best-v1",
];

for (const key of SAVED_KEYS) {
	test(`unparseable JSON in ${key} boots and walks every mode without an error`, async ({browser}) => {
		await withPair(browser, {storage: {...atLevel(1), [key]: "{bad"}}, async (pair) => {
			expect(pair.last.errors).toStrictEqual([]);
			await pair.click("#titleEdit");
			await pair.click("#modePlay");
			await pair.press("h");
			const reloaded = await pair.reload();
			expect(reloaded.errors).toStrictEqual([]);
		});
	});
}

const finishFirstCanvas = async (pair: Pair, seed: number) => {
	await pair.click("#titleInf");
	await pair.dismissTips();
	const level = engine.parseLevel(JSON.parse(JSON.stringify(engine.generateInfinite(seed, 0))));
	return pair.roll(engine.solve(level, engine.initState(level), 400000) as string);
};

test("the rating averages the last ten canvases, dropping the eleventh back", async ({browser}) => {
	const seed = 12345;
	const effs = [1, 0, ...Array<number>(8).fill(1)];
	const run = {seed, n: 0, score: 0, effs, cleared: 10, streak: 0, bestStreak: 0};
	await withPair(browser, {storage: {...atLevel(0), "cublitz-infinite-run-v1": JSON.stringify(run)}}, async (pair) => {
		const won = await finishFirstCanvas(pair, seed);
		const saved = JSON.parse(won.storage["cublitz-infinite-run-v1"] as string) as {effs: number[]};
		expect(saved.effs).toStrictEqual([...effs, 1]);
		expect((JSON.parse(won.storage["cublitz-infinite-best-v1"] as string) as {rating: number}).rating).toBe(90);
		const ratings = await Promise.all(pair.pages.map((page) => page.evaluate("[infRating({effs:[0,1,1,1,1,1,1,1,1,1]}), infRating({effs:[0,0,1,1,1,1,1,1,1,1,1]})]")));
		expect(ratings).toStrictEqual([[90, 90], [90, 90]]);
	});
});

test("hot data for a locked level is ignored and the first open level loads", async ({browser}) => {
	const data = {lvl: 20, st: {x: 0, y: 0, f: {t: "", b: "", n: "", s: "", e: "", w: ""}, boxes: [], sw: []}, hist: []};
	for (const useReady of [false, true]) {
		await withPair(browser, {storage: atLevel(1), hot: {data, useReady}}, async (pair) => {
			expect(pair.last.hud.num).toBe("Level 2 of 30");
			expect(pair.last.errors).toStrictEqual([]);
		});
	}
});

// A search that really reaches 400000 states takes many seconds, so the set of seen states reports its size.
test("the solver's default limit is 400000 states", async ({browser}) => {
	const solveAtSize = (size: number): string => `(() => {
		const RealSet = window.Set;
		window.Set = class extends RealSet { get size() { return ${size}; } };
		const path = solve(LEVELS[0], initState(LEVELS[0]));
		window.Set = RealSet;
		return [path, solve.hitLimit];
	})()`;
	await withPair(browser, {}, async (pair) => {
		const results = async (size: number) => Promise.all(pair.pages.map((page) => page.evaluate(solveAtSize(size))));
		const path = golden[0]?.path;
		expect(await results(399_999)).toStrictEqual([[path, false], [path, false]]);
		expect(await results(400_000)).toStrictEqual([[null, true], [null, true]]);
	});
});

test("confirming the reset cancels the disarm timer, so only the note's own timer is left", async ({browser}) => {
	await withPair(browser, {storage: atLevel(4)}, async (pair) => {
		await pair.click("#resetProgress", "arm");
		const armed = pair.last;
		expect(armed.timers).toStrictEqual([["timeout", 5000]]);
		const confirmed = await pair.click("#resetProgress", "confirm");
		expect(confirmed.timers).toStrictEqual([["clearTimeout", 5000], ["timeout", 3000]]);
		await pair.fireParkedTimers();
		expect(await pair.legacy.locator("#resetNote").isHidden()).toBe(true);
		expect(await pair.dist.locator("#resetNote").isHidden()).toBe(true);
	});
});
