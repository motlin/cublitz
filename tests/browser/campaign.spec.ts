import {readFileSync} from "node:fs";
import {expect, test} from "@playwright/test";
import type {SolveGolden} from "../support/golden.ts";
import {keyFor} from "../support/paths.ts";
import {atLevel, withPair} from "./harness/pair.ts";

const golden = JSON.parse(
	readFileSync(new URL("../golden/solve-post-fix.json", import.meta.url), "utf8"),
) as SolveGolden[];
const WASD: Record<string, string> = {N: "w", S: "s", E: "d", W: "a"};
const LAST = golden.length - 1;

// All three keyboard schemes get exercised on every level.
const mixedKeys = (direction: string, index: number): string =>
	index % 3 === 0 ? keyFor(direction) : index % 3 === 1 ? WASD[direction]! : WASD[direction]!.toUpperCase();

for (const {index, name, par, path} of golden) {
	test(`level ${index + 1} ${name}: solver path to a win, with its tutorial tips`, async ({browser}) => {
		await withPair(browser, {storage: atLevel(index, false)}, async (pair) => {
			await pair.click("#titlePlay");
			expect(pair.last.hud.num).toBe(`Level ${index + 1} of 30`);
			const tips = await pair.dismissTips();
			expect(tips.length).toBeGreaterThan(0);
			const won = await pair.roll(path!, mixedKeys);
			expect(won.win).toStrictEqual({
				hidden: false,
				title: "Perfect roll",
				score: `${par} moves · par ${par}`,
				note:
					index === LAST
						? "That was the last canvas. Replay any level to chase par, or build your own in the editor."
						: "You matched the shortest solution.",
				nextHidden: index === LAST,
				retryHidden: false,
			});
			expect(won.status.text).toBe("Cleared.");
			expect(JSON.parse(won.storage["cubist-progress-v2"]!)[name]).toBe(par);
			if (index === LAST) {
				const replay = await pair.click("#winRetry");
				expect(replay.hud).toStrictEqual({name, num: "Level 30 of 30", moves: "0", par: String(par)});
			} else {
				const next = await pair.click("#winNext");
				expect(next.hud.num).toBe(`Level ${index + 2} of 30`);
			}
		});
	});
}

test("fresh save: all 30 levels unlock one by one, with reduced motion", async ({browser}) => {
	await withPair(browser, {reducedMotion: true}, async (pair) => {
		const enabled = async () => pair.legacy.locator(".lvbtn:not([disabled])").count();
		await pair.press("Enter", "start from the title with Enter");
		for (const {index, path} of golden) {
			expect(pair.last.hud.num).toBe(`Level ${index + 1} of 30`);
			await pair.dismissTips();
			expect(await enabled()).toBe(index + 1);
			const won = await pair.roll(path!);
			expect(won.win.hidden).toBe(false);
			expect(await enabled()).toBe(Math.min(30, index + 2));
			if (index < LAST) await pair.press("Enter", "next level with Enter");
		}
		await pair.click(".brand");
		expect(await pair.legacy.locator("#titleProgress").textContent()).toBe("All 30 levels cleared");
		expect(await pair.legacy.locator("#titlePlay").textContent()).toBe("Play again");
		await pair.reload();
		expect(await pair.legacy.locator("#titleProgress").textContent()).toBe("All 30 levels cleared");
	});
});
