import {expect, test} from "@playwright/test";
import {atLevel, engine, type Pair, withPair} from "./harness/pair.ts";

const text = (pair: Pair, selector: string): Promise<string | null> => pair.legacy.locator(selector).textContent();
const openEditor = async (pair: Pair): Promise<void> => {
	await pair.click("#titleEdit");
};

test("blocked storage: saving a level says so, and the rest of the page carries on", async ({browser}) => {
	const setup = (): void => {
		Storage.prototype.setItem = () => {
			throw new DOMException("blocked", "QuotaExceededError");
		};
	};
	await withPair(browser, {storage: atLevel(1), setup}, async (pair) => {
		await openEditor(pair);
		await pair.click("#edSave");
		expect(await text(pair, "#edResult")).toBe("Couldn’t save. This browser is blocking storage. Copy the share code instead.");
	});
});

const CLIPBOARDS: [string, () => void][] = [
	[
		"rejects",
		() => {
			navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
		},
	],
	[
		"is missing",
		() => {
			Object.defineProperty(navigator, "clipboard", {value: undefined});
		},
	],
];

for (const [name, setup] of CLIPBOARDS) {
	test(`copying a share code when the clipboard ${name} selects the code instead`, async ({browser}) => {
		await withPair(browser, {storage: atLevel(1), setup}, async (pair) => {
			await openEditor(pair);
			await pair.click("#edCopy");
			expect(await text(pair, "#edCodeNote")).toBe("Selected. Press Ctrl+C or Cmd+C to copy.");
		});
	});
}

test("history.replaceState throwing falls back to setting the hash", async ({browser}) => {
	const setup = (): void => {
		history.replaceState = () => {
			throw new DOMException("too many calls", "SecurityError");
		};
	};
	await withPair(browser, {storage: atLevel(1), setup}, async (pair) => {
		const editing = await pair.click("#titleEdit");
		expect(editing.location).toBe("#editor");
	});
});

const AUDIO: [string, () => void, unknown][] = [
	[
		"only under its old WebKit name",
		() => {
			(window as unknown as {AudioContext: unknown}).AudioContext = undefined;
		},
		["new AudioContext"],
	],
	[
		"not at all",
		() => {
			(window as unknown as {AudioContext: unknown}).AudioContext = undefined;
			window.webkitAudioContext = undefined as never;
		},
		undefined,
	],
];

for (const [name, setup, first] of AUDIO) {
	test(`audio available ${name}`, async ({browser}) => {
		await withPair(browser, {storage: atLevel(1), setup}, async (pair) => {
			const started = await pair.click("#titlePlay");
			expect(started.audio[0]).toStrictEqual(first);
			expect(started.errors).toStrictEqual([]);
		});
	});
}

// The solver gives up once it has seen too many states. Real ones take many seconds to reach, so its
// set of seen states reports a huge size instead. The harness's own sets already exist by then.
const makeSolverGiveUp = (pair: Pair): Promise<unknown> =>
	pair.step("the solver's limit will be hit at once", (page) =>
		page.evaluate(() => {
			window.Set = class extends Set {
				override get size(): number {
					return Number.MAX_SAFE_INTEGER;
				}
			} as SetConstructor;
		}),
	);

test("the hint and the solution both report when the solver gives up", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await pair.click("#titlePlay");
		await makeSolverGiveUp(pair);
		const hinted = await pair.click("#hintBtn");
		expect(hinted.status).toStrictEqual({
			text: "Too many possibilities. The hint gave up on this one.",
			html: "<b>Too many possibilities.</b> The hint gave up on this one.",
			warn: true,
		});
		const solved = await pair.click("#solBtn");
		expect(solved.solution).toStrictEqual({hidden: false, text: "Too many possibilities. The solver gave up from this position. Try restarting the level."});
	});
});

test("pointercancel ends painting in the editor", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await openEditor(pair);
		await pair.click("#edClear");
		await pair.click('[data-tool="floor"]');
		const cellBox = async (page: Pair["legacy"], x: number) => {
			const box = await page.locator(`#edGrid [data-x="${x}"][data-y="1"]`).boundingBox();
			if (!box) throw new Error("the cell has no box");
			return {x: box.x + 5, y: box.y + 5};
		};
		const painted = await pair.step("press, cancel, then move on", async (page) => {
			const from = await cellBox(page, 0);
			const to = await cellBox(page, 2);
			await page.mouse.move(from.x, from.y);
			await page.mouse.down();
			await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel")));
			await page.mouse.move(to.x, to.y);
			await page.mouse.up();
		});
		const {grid} = JSON.parse(painted.storage["cubist-editor-draft-v1"] as string) as {grid: unknown[][]};
		expect(grid[1]?.slice(0, 3)).toStrictEqual([{t: "floor"}, null, null]);
	});
});

test("arrow keys are swallowed but do not roll while a tip is open", async ({browser}) => {
	await withPair(browser, {storage: atLevel(0, false)}, async (pair) => {
		await pair.click("#titlePlay");
		expect(pair.last.tip.hidden).toBe(false);
		const pressed = await pair.press("ArrowRight");
		expect(pressed.prevented).toStrictEqual(["keydown ArrowRight"]);
		expect(pressed.hud.moves).toBe("0");
	});
});

test("focus moves without scrolling, to the tip's button and the next-canvas button", async ({browser}) => {
	const SEED = 12345;
	const run = JSON.stringify({seed: SEED, n: 0, score: 0, effs: [], cleared: 0, streak: 0, bestStreak: 0});
	await withPair(browser, {storage: {...atLevel(0, false), "cublitz-infinite-run-v1": run}}, async (pair) => {
		const opened = await pair.click("#titleInf");
		expect(opened.focusCalls).toContainEqual(["tipOk", {preventScroll: true}]);
		await pair.dismissTips();
		const level = engine.parseLevel(JSON.parse(JSON.stringify(engine.generateInfinite(SEED, 0))));
		const won = await pair.roll(engine.solve(level, engine.initState(level), 400000) as string);
		expect(won.focusCalls).toStrictEqual([["winNext", {preventScroll: true}]]);
	});
});

test("a win with fewer cleared but more points still raises the best score", async ({browser}) => {
	const SEED = 12345;
	const storage = {
		...atLevel(0),
		"cublitz-infinite-run-v1": JSON.stringify({seed: SEED, n: 0, score: 0, effs: [], cleared: 0, streak: 0, bestStreak: 0}),
		"cublitz-infinite-best-v1": JSON.stringify({cleared: 5, score: 50, rating: 0}),
	};
	await withPair(browser, {storage}, async (pair) => {
		await pair.click("#titleInf");
		await pair.dismissTips();
		const level = engine.parseLevel(JSON.parse(JSON.stringify(engine.generateInfinite(SEED, 0))));
		const won = await pair.roll(engine.solve(level, engine.initState(level), 400000) as string);
		expect(JSON.parse(won.storage["cublitz-infinite-best-v1"] as string)).toStrictEqual({cleared: 5, score: 100, rating: 0});
	});
});
