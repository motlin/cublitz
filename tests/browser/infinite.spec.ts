import {readFileSync} from "node:fs";
import {expect, test} from "@playwright/test";
import type {InfiniteGolden} from "../support/golden.ts";
import {atLevel, engine, withPair} from "./harness/pair.ts";

const golden = JSON.parse(
	readFileSync(new URL("../golden/infinite.json", import.meta.url), "utf8"),
) as InfiniteGolden[];
const SEED = 12345;
const canvas = (n: number): InfiniteGolden => golden.find((g) => g.seed === SEED && g.n === n) as InfiniteGolden;
const pinnedRun = {
	"cublitz-infinite-run-v1": JSON.stringify({
		seed: SEED,
		n: 0,
		score: 0,
		effs: [],
		cleared: 0,
		streak: 0,
		bestStreak: 0,
	}),
};

test("a pinned seed plays three canvases to a first rank", async ({browser}) => {
	await withPair(browser, {storage: {...atLevel(0), ...pinnedRun}}, async (pair) => {
		await pair.click("#titleInf");
		for (const n of [0, 1, 2]) {
			const {level, path} = canvas(n);
			expect(pair.last.hud).toStrictEqual({
				name: `Canvas ${n + 1}`,
				num: "Infinite mode",
				moves: "0",
				par: String(level.par),
			});
			await pair.dismissTips();
			const won = await pair.roll(path);
			expect(won.win).toStrictEqual({
				hidden: false,
				title: "Perfect roll",
				score: `${level.par} rolls · par ${level.par} · +100 points`,
				note:
					n < 2
						? `Clear ${2 - n} more to get your first rank.`
						: "Rank: Grandmaster (rating 100, from your last 3 canvases).",
				nextHidden: false,
				retryHidden: true,
			});
			await pair.press("Enter", "next canvas");
		}
		expect(pair.last.hud.name).toBe("Canvas 4");
		expect(JSON.parse(pair.last.storage["cublitz-infinite-best-v1"] as string)).toStrictEqual({
			cleared: 3,
			score: 300,
			rating: 100,
		});
		await pair.click(".brand");
		expect(await pair.legacy.locator("#titleInf").textContent()).toBe("Infinite · Canvas 4");
		expect(await pair.legacy.locator("#titleProgress").textContent()).toBe("30 levels · Infinite best 3");
		await pair.reload();
		await pair.click("#titleInf", "resume the saved run after a reload");
		expect(pair.last.hud.name).toBe("Canvas 4");
	});
});

test("rolls all count: undo, restart and an over-par win", async ({browser}) => {
	await withPair(browser, {storage: {...atLevel(0), ...pinnedRun}}, async (pair) => {
		await pair.click("#titleInf");
		const {level, path} = canvas(0);
		await pair.roll(path.slice(0, 2));
		await pair.press("z");
		expect(pair.last.hud.moves).toBe("2");
		await pair.press("h", "hints are disabled in infinite mode");
		expect(pair.last.hint.hidden).toBe(true);
		await pair.press("r");
		expect(pair.last.hud.moves).toBe("2");
		const won = await pair.roll(path);
		const m = (level.par as number) + 2;
		expect(won.win).toStrictEqual({
			hidden: false,
			title: "Cleared",
			score: `${m} rolls · par ${level.par} · +${Math.round((100 * (level.par as number)) / m)} points`,
			note: "Clear 2 more to get your first rank.",
			nextHidden: false,
			retryHidden: true,
		});
	});
});

test("skip, new-run arm and timeout, and a seed drawn from the pinned Math.random", async ({browser}) => {
	await withPair(browser, {storage: atLevel(0)}, async (pair) => {
		const fresh = await pair.click("#titleInf");
		const seed = (JSON.parse(fresh.storage["cublitz-infinite-run-v1"] as string) as {seed: number}).seed;
		expect(seed).toBe(Math.floor(seedFromPinnedRandom() * 1e9));
		await pair.click("#infSkip");
		expect(await pair.legacy.locator("#infNote").textContent()).toBe(
			"Skipped. That canvas counts as 0 toward your rating.",
		);
		expect(pair.last.hud.name).toBe("Canvas 2");
		await pair.fireParkedTimers();
		await pair.click("#infNew", "arm new run");
		await pair.fireParkedTimers();
		await pair.click("#infNew", "arm again");
		const renewed = await pair.click("#infNew", "confirm new run");
		const run = JSON.parse(renewed.storage["cublitz-infinite-run-v1"] as string) as {seed: number; n: number};
		expect(run.n).toBe(0);
		const level = engine.parseLevel(JSON.parse(JSON.stringify(engine.generateInfinite(run.seed, 0))));
		const won = await pair.roll(engine.solve(level, engine.initState(level)) as string);
		expect(won.win.hidden).toBe(false);
		await pair.click("#winNext");
		await pair.click("#modePlay", "leave infinite for the campaign");
		expect(pair.last.hud.num).toBe("Level 1 of 30");
	});
});

// The first draw from the harness's pinned generator, seeded the same way as in instruments.ts.
function seedFromPinnedRandom(): number {
	const a = (20260102 + 0x6d2b79f5) | 0;
	let t = Math.imul(a ^ (a >>> 15), 1 | a);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
