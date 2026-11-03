import {expect, test} from "@playwright/test";
import {readSolveGolden} from "../support/golden.ts";
import {findBlockedMove, findDeadEnd, findMissedGoal, keyFor} from "../support/paths.ts";
import {atLevel, engine, type Pair, withPair} from "./harness/pair.ts";

const golden = readSolveGolden("solve-post-fix.json");
const pathOf = (index: number): string => golden[index]!.path!;
const level = (index: number) => engine.LEVELS[index]!;
const openLevel = async (pair: Pair): Promise<void> => {
	await pair.click("#titlePlay");
};
const CNAME: Record<string, string> = {
	r: "red",
	o: "orange",
	y: "yellow",
	g: "green",
	c: "cyan",
	b: "blue",
	p: "purple",
	w: "white",
};
const WORD: Record<string, string> = {N: "north", S: "south", E: "east", W: "west"};
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

type Blocked = {
	title: string;
	index: number;
	why: string;
	accept?: (r: Record<string, unknown>) => boolean;
	text: (r: Record<string, string>, dir: string) => string;
};
const BLOCKED: Blocked[] = [
	{title: "edge", index: 0, why: "edge", text: () => "<b>Edge.</b> Nothing to roll onto that way."},
	{
		title: "color gate, bare face",
		index: 2,
		why: "gate",
		accept: (r) => !r["down"],
		text: (r, d) => `<b>${cap(CNAME[r["c"]!]!)} gate.</b> Rolling ${WORD[d]} would put a bare face down.`,
	},
	{
		title: "color gate, wrong color",
		index: 3,
		why: "gate",
		accept: (r) => !!r["down"] && r["down"] !== r["c"],
		text: (r, d) =>
			`<b>${cap(CNAME[r["c"]!]!)} gate.</b> Rolling ${WORD[d]} would put ${CNAME[r["down"]!]} face down.`,
	},
	{
		title: "plain white gate",
		index: 20,
		why: "wgate",
		accept: (r) => r["f"] === "b",
		text: (r, d) =>
			`<b>White gate.</b> It needs a bare face down, but rolling ${WORD[d]} would put ${CNAME[r["has"]!]} down.`,
	},
	{
		title: "named white gate",
		index: 21,
		why: "wgate",
		text: (r) =>
			`<b>East white gate.</b> Your east face has to be bare when you land, but it would be ${CNAME[r["has"]!]}.`,
	},
	{
		title: "shut door",
		index: 8,
		why: "door",
		text: () => "<b>Red door is shut.</b> Flip a red switch or hold down a red button.",
	},
	{
		title: "colored box",
		index: 9,
		why: "box",
		text: () => "<b>Blue box.</b> Only a cube painted solid blue can push it.",
	},
	{
		title: "white box",
		index: 29,
		why: "box",
		accept: (r) => r["c"] === "w",
		text: () => "<b>White box.</b> Only a completely bare cube can push it.",
	},
	{
		title: "stuck box",
		index: 9,
		why: "stuck",
		text: () => "<b>The box won't budge.</b> Something is in the way on the other side.",
	},
];

for (const {title, index, why, accept, text} of BLOCKED) {
	test(`blocked move: ${title}`, async ({browser}) => {
		const found = findBlockedMove(engine, level(index), why, accept);
		if (!found) throw new Error(`No ${why} block on level ${index}`);
		await withPair(browser, {storage: atLevel(index)}, async (pair) => {
			await openLevel(pair);
			await pair.roll(found.path);
			const moves = pair.last.hud.moves;
			const blocked = await pair.press(keyFor(found.dir), "blocked roll");
			let state = engine.initState(level(index));
			for (const d of found.path) state = engine.tryMove(level(index), state, d).st!;
			const detail = engine.tryMove(level(index), state, found.dir) as unknown as Record<string, string>;
			expect(blocked.status).toStrictEqual({
				text: text(detail, found.dir).replace(/<\/?b>/g, ""),
				html: text(detail, found.dir),
				warn: true,
			});
			expect(blocked.hud.moves).toBe(moves);
			expect(blocked.audio.length).toBeGreaterThan(0);
			await pair.press(keyFor(found.dir), "blocked roll again");
		});
	});
}

test("landing on a picky target without its colors", async ({browser}) => {
	const path = findMissedGoal(engine, level(4))!;
	await withPair(browser, {storage: atLevel(4)}, async (pair) => {
		await openLevel(pair);
		const missed = await pair.roll(path);
		expect(missed.status).toStrictEqual({
			text: "Not yet. The target needs yellow on top.",
			html: "<b>Not yet.</b> The target needs yellow on top.",
			warn: true,
		});
		expect(missed.win.hidden).toBe(true);
	});
});

test("undo and restart with every input", async ({browser}) => {
	await withPair(browser, {storage: atLevel(3)}, async (pair) => {
		await openLevel(pair);
		await pair.roll(pathOf(3).slice(0, 6));
		expect((await pair.press("z")).status.text).toBe("Undid one roll.");
		await pair.press("Z");
		await pair.press("Backspace");
		await pair.click("#undoBtn");
		expect(pair.last.hud.moves).toBe("2");
		await pair.press("r");
		expect(pair.last.hud.moves).toBe("0");
		await pair.press("z", "undo with nothing to undo");
		await pair.roll(pathOf(3).slice(0, 3));
		await pair.click("#resetBtn");
		await pair.press("R");
		expect(pair.last.hud.moves).toBe("0");
	});
});

test("keys pressed during a roll are queued, last one wins", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await openLevel(pair);
		const after = await pair.step("three fast rolls", async (page) => {
			await page.keyboard.press("ArrowRight");
			await page.keyboard.press("ArrowLeft");
			await page.keyboard.press("ArrowRight");
		});
		expect(after.hud.moves).toBe("2");
	});
});

test("win below par, over par, replay and best score", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await openLevel(pair);
		const over = await pair.roll(`EW${pathOf(1)}`);
		expect(over.win).toStrictEqual({
			hidden: false,
			title: "Dry and done",
			score: "8 moves · par 6",
			note: "Par is 6. Replay to tighten it up.",
			nextHidden: false,
			retryHidden: false,
		});
		await pair.press("ArrowLeft", "input after a win is ignored");
		await pair.press("z", "undo after a win is ignored");
		await pair.click("#winRetry");
		const best = await pair.roll(pathOf(1));
		expect(best.storage["cubist-progress-v2"]).toBe(JSON.stringify({"First Roll": 99, "First Coat": 6}));
	});
});

const HINT_LEVELS: [number, string[]][] = [
	[1, ["gate", "goal"]],
	[4, ["gate", "goal"]],
	[8, ["door", "goal", "solid", "switch"]],
	[9, ["button", "door", "goal", "solid"]],
	[21, ["goal", "wgate"]],
	[28, ["button", "door", "gate", "goal", "wash"]],
];
const milestone = (text: string): string => {
	if (text.includes("paint remover")) return "wash";
	if (text.includes("white gate")) return "wgate";
	if (text.includes(" gate.")) return "gate";
	if (text.includes("coat all six")) return "solid";
	if (text.includes(" switch.")) return "switch";
	if (text.includes(" box onto ")) return "button";
	if (text.includes(" door.")) return "door";
	if (text.includes("Head for the target")) return "goal";
	return `unknown: ${text}`;
};

for (const [index, expected] of HINT_LEVELS) {
	test(`hints at every tier while solving level ${index + 1}`, async ({browser}) => {
		await withPair(browser, {storage: atLevel(index)}, async (pair) => {
			await openLevel(pair);
			const seen = new Set<string>();
			let i = 0;
			for (const d of pathOf(index)) {
				const tier1 = await pair.press("h", `hint at roll ${i}`);
				seen.add(milestone(tier1.hint.text));
				expect(tier1.hint.hidden).toBe(false);
				// A hint keeps its tier while the milestone stays the same, and starts over at a new one.
				let tier = tier1.hint.step;
				if (tier === "Hint 1 of 3") tier = (await pair.click("#hintMore")).hint.step;
				if (tier === "Hint 2 of 3") tier = (await pair.click("#hintMore")).hint.step;
				expect(tier).toBe("Hint 3 of 3");
				await pair.press(keyFor(d), `roll after hint ${i}`);
				i++;
			}
			expect([...seen].toSorted()).toStrictEqual(expected);
			expect(pair.last.win.hidden).toBe(false);
		});
	});
}

test("hint can be hidden and re-asked, and is cleared by the solution", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await openLevel(pair);
		await pair.click("#hintBtn");
		await pair.click("#hintClose");
		expect(pair.last.hint.hidden).toBe(true);
		await pair.press("H");
		await pair.click("#solBtn");
		expect(pair.last.hint.hidden).toBe(true);
		expect(pair.last.solution.hidden).toBe(false);
		await pair.press("h", "hint clears the solution");
		expect(pair.last.solution.hidden).toBe(true);
	});
});

test("hints and solutions from a position with no way out", async ({browser}) => {
	const index = 20;
	const path = findDeadEnd(engine, level(index))!;
	await withPair(browser, {storage: atLevel(index)}, async (pair) => {
		await openLevel(pair);
		await pair.roll(path);
		const stuck = await pair.press("h");
		expect(stuck.status).toStrictEqual({
			text: "Stuck. No way to finish from here. Undo or restart.",
			html: "<b>Stuck.</b> No way to finish from here. Undo or restart.",
			warn: true,
		});
		const noWay = await pair.click("#solBtn");
		expect(noWay.solution).toStrictEqual({
			hidden: false,
			text: "No way out from here. Undo a few rolls or restart, then ask again.",
		});
		await pair.press("z", "undo out of the dead end");
		await pair.click("#solBtn", "solution again restores the buttons");
	});
});

test("solution reveal: next, up to goal, reveal the rest, pause, follow, diverge, undo, win as Solved", async ({
	browser,
}) => {
	const index = 8;
	await withPair(browser, {storage: atLevel(index)}, async (pair) => {
		await openLevel(pair);
		const path = pathOf(index);
		const first = await pair.click("#solBtn");
		expect(first.solution).toStrictEqual({
			hidden: false,
			text: `Showing 1 of ${path.length} rolls. Follow the arrows in number order, or reveal more.`,
		});
		await pair.click("#solBtn", "pressing again reveals one more");
		await pair.click("#solNext");
		await pair.click("#solGoal");
		await pair.click("#solAll");
		await pair.tickIntervals(1);
		await pair.click("#solAll", "pause the auto reveal");
		await pair.tickIntervals(1);
		await pair.click("#solAll", "resume the auto reveal");
		const all = await pair.tickIntervals(path.length);
		expect(all.solution).toStrictEqual({
			hidden: false,
			text: `Full solution shown: ${path.length} rolls from where you are. Follow the arrows in number order; each one disappears as you roll it.`,
		});
		await pair.roll(path.slice(0, 3));
		await pair.press("z", "undo keeps the reveal");
		await pair.click("#solHide");
		expect(pair.last.solution.hidden).toBe(true);
		await pair.click("#solBtn");
		const off = path[3] === "N" ? "S" : "N";
		await pair.press(keyFor(off), "roll away from the solution re-plans it");
		await pair.press("r");
		await pair.click("#solBtn");
		const solved = await pair.roll(path);
		expect(solved.win).toStrictEqual({
			hidden: false,
			title: "Solved",
			score: "19 moves · par 19",
			note: "You followed the solution this time. Replay it from memory when you are ready.",
			nextHidden: false,
			retryHidden: false,
		});
	});
});

test("title screen: progress text, tutorial replay, reset arm, timeout and confirm", async ({browser}) => {
	await withPair(browser, {storage: atLevel(4)}, async (pair) => {
		const title = async () => pair.legacy.locator("#titleProgress").textContent();
		expect(await title()).toBe("4 of 31 levels cleared");
		await pair.click("#tipsReplay");
		await pair.fireParkedTimers();
		await pair.click("#resetProgress");
		await pair.fireParkedTimers();
		await pair.click("#resetProgress", "arm");
		const erased = await pair.click("#resetProgress", "confirm");
		expect(erased.storage).toStrictEqual({"cubist-progress-v2": "{}"});
		expect(await title()).toBe("31 levels");
		await pair.fireParkedTimers();
		await pair.reload();
		await pair.press("Space", "space starts the game when no button has focus");
		const tips = await pair.dismissTips();
		expect(tips).toStrictEqual(["Rolling"]);
		expect(pair.last.storage["cubist-tips-seen-v1"]).toBe(JSON.stringify({roll: true}));
	});
});

test("navigation: brand, mode buttons, levels list, hash and window resize", async ({browser}) => {
	await withPair(browser, {storage: atLevel(6)}, async (pair) => {
		await openLevel(pair);
		await pair.click(".lvbtn:nth-child(2)", "go back to an unlocked level");
		expect(pair.last.hud.num).toBe("Level 2 of 31");
		await pair.click("#modeEdit");
		expect(pair.last.location).toBe("#editor");
		await pair.click("#modePlay");
		expect(pair.last.location).toBe("");
		await pair.resize(700, 600);
		await pair.click(".brand");
		await pair.click("#titleEdit");
		await pair.resize(1000, 700);
		await pair.click(".brand");
		await pair.step("hash navigation to the editor", async (page) =>
			page.evaluate(() => (location.hash = "#editor")),
		);
		expect(pair.last.location).toBe("#editor");
		await pair.reload();
		await pair.step("hash cleared", async (page) => page.evaluate(() => (location.hash = "")));
	});
});

const RESUME = {
	lvl: 1,
	name: "First Coat",
	st: {x: 2, y: 1, f: {t: "", b: "r", n: "", s: "", e: "", w: ""}, boxes: [], sw: []},
	hist: [],
};

test("window.claude.hot hooks: data resumes a level, with and without ready", async ({browser}) => {
	for (const useReady of [false, true]) {
		await withPair(browser, {storage: atLevel(1), hot: {data: RESUME, useReady}}, async (pair) => {
			expect(pair.last.audio).toStrictEqual([["hot.snapshot", "function"]]);
			const snapshots = await Promise.all(
				pair.pages.map(async (page) =>
					page.evaluate(() => (window as unknown as {__hotSnapshot: () => unknown}).__hotSnapshot()),
				),
			);
			expect(snapshots[1]).toStrictEqual(snapshots[0]);
			expect(snapshots[0]).toStrictEqual({...RESUME, mode: "title"});
			await pair.click("#titlePlay");
			expect(pair.last.hud.moves).toBe("0");
		});
	}
});

test("level data order and names reach the page unchanged", async ({browser}) => {
	const everything = Object.fromEntries(golden.map((g) => [g.name, g.par]));
	await withPair(
		browser,
		{storage: {...atLevel(0), "cubist-progress-v2": JSON.stringify(everything)}},
		async (pair) => {
			await openLevel(pair);
			for (const {index, name, par} of golden) {
				const shown = await pair.click(`.lvbtn:nth-child(${index + 1})`, `open level ${index + 1}`);
				expect(shown.hud).toStrictEqual({name, num: `Level ${index + 1} of 31`, moves: "0", par: String(par)});
			}
		},
	);
});
