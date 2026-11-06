import {expect, test} from "@playwright/test";
import {readSolveGolden} from "../support/golden.ts";
import {findBlockedMove, findDeadEnd, findMissedGoal, keyFor} from "../support/paths.ts";
import {engine} from "../support/engine.ts";
import {atLevel} from "./harness/page.ts";
import {type Session, withSession} from "./harness/session.ts";

const golden = readSolveGolden("solve-post-fix.json");
const pathOf = (index: number): string => golden[index]!.path!;
const level = (index: number) => engine.LEVELS[index]!;
const openLevel = async (session: Session): Promise<void> =>
{
	await session.click("#titlePlay");
};
const CNAME: Record<string, string> =
{
	r: "red",
	o: "orange",
	y: "yellow",
	g: "green",
	c: "cyan",
	b: "blue",
	p: "purple",
	w: "white",
};
const WORD: Record<string, string> =
{
	N: "north",
	S: "south",
	E: "east",
	W: "west",
};
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

type Blocked =
{
	title: string;
	index: number;
	why: string;
	accept?: (r: Record<string, unknown>) => boolean;
	text: (r: Record<string, string>, dir: string) => string;
};
const BLOCKED: Blocked[] = [
	{
		title: "edge",
		index: 0,
		why: "edge",
		text: () => "<b>Edge.</b> Nothing to roll onto that way.",
	},
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

for (const {title, index, why, accept, text} of BLOCKED)
{
	test(`blocked move: ${title}`, async ({browser}) =>
	{
		const found = findBlockedMove(engine, level(index), why, accept);
		if (!found) throw new Error(`No ${why} block on level ${index}`);
		await withSession(
			browser,
			{
				storage: atLevel(index),
			},
			async (session) =>
			{
				await openLevel(session);
				await session.roll(found.path);
				const moves = session.last.hud.moves;
				const blocked = await session.press(keyFor(found.dir), "blocked roll");
				let state = engine.initState(level(index));
				for (const d of found.path)
					state = (
						engine.tryMove(level(index), state, d) as
						{
							st: typeof state;
						}
					).st;
				const detail = engine.tryMove(level(index), state, found.dir) as unknown as Record<string, string>;
				expect(blocked.status).toStrictEqual(
					{
						text: text(detail, found.dir).replace(/<\/?b>/g, ""),
						html: text(detail, found.dir),
						warn: true,
					},
				);
				expect(blocked.hud.moves).toBe(moves);
				expect(blocked.audio.length).toBeGreaterThan(0);
				await session.press(keyFor(found.dir), "blocked roll again");
			},
		);
	});
}

test("landing on a picky target without its colors", async ({browser}) =>
{
	const path = findMissedGoal(engine, level(4))!;
	await withSession(
		browser,
		{
			storage: atLevel(4),
		},
		async (session) =>
		{
			await openLevel(session);
			const missed = await session.roll(path);
			expect(missed.status).toStrictEqual(
				{
					text: "Not yet. The target needs yellow on top.",
					html: "<b>Not yet.</b> The target needs yellow on top.",
					warn: true,
				},
			);
			expect(missed.win.hidden).toBe(true);
		},
	);
});

test("undo and restart with every input", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(3),
		},
		async (session) =>
		{
			await openLevel(session);
			await session.roll(pathOf(3).slice(0, 6));
			expect((await session.press("z")).status.text).toBe("Undid one roll.");
			await session.press("Z");
			await session.press("Backspace");
			await session.click("#undoBtn");
			expect(session.last.hud.moves).toBe("2");
			await session.press("r");
			expect(session.last.hud.moves).toBe("0");
			await session.press("z", "undo with nothing to undo");
			await session.roll(pathOf(3).slice(0, 3));
			await session.click("#resetBtn");
			await session.press("R");
			expect(session.last.hud.moves).toBe("0");
		},
	);
});

test("keys pressed during a roll are queued, last one wins", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openLevel(session);
			const after = await session.step("three fast rolls", async (page) =>
			{
				await page.keyboard.press("ArrowRight");
				await page.keyboard.press("ArrowLeft");
				await page.keyboard.press("ArrowRight");
			});
			expect(after.hud.moves).toBe("2");
		},
	);
});

/** Rolls east and, in the same task, runs `then`, so it lands while the roll is still animating. The roll's
 * element is gone from the page by then, so settling doesn't wait for it, and the wait covers its 170ms. */
const rollEastThen = async (session: Session, then: string): Promise<void> =>
{
	await session.step("roll east, then leave mid-roll", async (page) =>
	{
		await page.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight"})); ${then}`);
		await page.waitForTimeout(400);
	});
};

test("restarting mid-roll leaves the cube at the start", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openLevel(session);
			const start = await session.page.evaluate("JSON.stringify(S.st)");
			await rollEastThen(session, "restart()");
			expect(session.last.hud.moves).toBe("0");
			expect(await session.page.evaluate("JSON.stringify(S.st)")).toBe(start);
		},
	);
});

test("leaving a level with a box mid-roll starts the next level clean", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openLevel(session);
			await session.page.evaluate(
				`startLevel(parseLevel({name: "T", map: ["S..1."], k: {"1": ["box", "w"]}}), -3)`,
			);
			await rollEastThen(session, `document.querySelector('#levels button[title^="First Roll"]').click()`);
			expect(await session.page.evaluate("JSON.stringify(S.st)")).toBe(
				JSON.stringify(engine.initState(level(0))),
			);
		},
	);
});

test("win below par, over par, replay and best score", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openLevel(session);
			const over = await session.roll(`EW${pathOf(1)}`);
			expect(over.win).toStrictEqual(
				{
					hidden: false,
					title: "Dry and done",
					score: "8 moves · par 6",
					note: "Par is 6. Replay to tighten it up.",
					nextHidden: false,
					retryHidden: false,
				},
			);
			await session.press("ArrowLeft", "input after a win is ignored");
			await session.press("z", "undo after a win is ignored");
			await session.click("#winRetry");
			const best = await session.roll(pathOf(1));
			expect(best.storage["cubist-progress-v2"]).toBe(
				JSON.stringify(
					{
						"First Roll": 99,
						"First Coat": 6,
					},
				),
			);
		},
	);
});

const HINT_LEVELS: [number, string[]][] = [
	[1, ["gate", "goal"]],
	[4, ["gate", "goal"]],
	[8, ["door", "goal", "solid", "switch"]],
	[9, ["button", "door", "goal", "solid"]],
	[21, ["goal", "wgate"]],
	[28, ["button", "door", "gate", "goal", "wash"]],
];
const milestone = (text: string): string =>
{
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

for (const [index, expected] of HINT_LEVELS)
{
	test(`hints at every tier while solving level ${index + 1}`, async ({browser}) =>
	{
		await withSession(
			browser,
			{
				storage: atLevel(index),
			},
			async (session) =>
			{
				await openLevel(session);
				const seen = new Set<string>();
				let i = 0;
				for (const d of pathOf(index))
				{
					const tier1 = await session.press("h", `hint at roll ${i}`);
					seen.add(milestone(tier1.hint.text));
					expect(tier1.hint.hidden).toBe(false);
					// A hint keeps its tier while the milestone stays the same, and starts over at a new one.
					let tier = tier1.hint.step;
					if (tier === "Hint 1 of 3") tier = (await session.click("#hintMore")).hint.step;
					if (tier === "Hint 2 of 3") tier = (await session.click("#hintMore")).hint.step;
					expect(tier).toBe("Hint 3 of 3");
					await session.press(keyFor(d), `roll after hint ${i}`);
					i++;
				}
				expect([...seen].toSorted()).toStrictEqual(expected);
				expect(session.last.win.hidden).toBe(false);
			},
		);
	});
}

test("hint can be hidden and re-asked, and is cleared by the solution", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openLevel(session);
			await session.click("#hintBtn");
			await session.click("#hintClose");
			expect(session.last.hint.hidden).toBe(true);
			await session.press("H");
			await session.click("#solBtn");
			expect(session.last.hint.hidden).toBe(true);
			expect(session.last.solution.hidden).toBe(false);
			await session.press("h", "hint clears the solution");
			expect(session.last.solution.hidden).toBe(true);
		},
	);
});

test("hints and solutions from a position with no way out", async ({browser}) =>
{
	const index = 20;
	const path = findDeadEnd(engine, level(index))!;
	await withSession(
		browser,
		{
			storage: atLevel(index),
		},
		async (session) =>
		{
			await openLevel(session);
			await session.roll(path);
			const stuck = await session.press("h");
			expect(stuck.status).toStrictEqual(
				{
					text: "Stuck. No way to finish from here. Undo or restart.",
					html: "<b>Stuck.</b> No way to finish from here. Undo or restart.",
					warn: true,
				},
			);
			const noWay = await session.click("#solBtn");
			expect(noWay.solution).toStrictEqual(
				{
					hidden: false,
					text: "No way out from here. Undo a few rolls or restart, then ask again.",
				},
			);
			await session.press("z", "undo out of the dead end");
			await session.click("#solBtn", "solution again restores the buttons");
		},
	);
});

test("solution reveal: next, up to goal, reveal the rest, pause, follow, diverge, undo, win as Solved", async ({
	browser,
}) =>
{
	const index = 8;
	await withSession(
		browser,
		{
			storage: atLevel(index),
		},
		async (session) =>
		{
			await openLevel(session);
			const path = pathOf(index);
			const first = await session.click("#solBtn");
			expect(first.solution).toStrictEqual(
				{
					hidden: false,
					text: `Showing 1 of ${path.length} rolls. Follow the arrows in number order, or reveal more.`,
				},
			);
			await session.click("#solBtn", "pressing again reveals one more");
			await session.click("#solNext");
			await session.click("#solGoal");
			await session.click("#solAll");
			await session.tickIntervals(1);
			await session.click("#solAll", "pause the auto reveal");
			await session.tickIntervals(1);
			await session.click("#solAll", "resume the auto reveal");
			const all = await session.tickIntervals(path.length);
			expect(all.solution).toStrictEqual(
				{
					hidden: false,
					text: `Full solution shown: ${path.length} rolls from where you are. Follow the arrows in number order; each one disappears as you roll it.`,
				},
			);
			await session.roll(path.slice(0, 3));
			await session.press("z", "undo keeps the reveal");
			await session.click("#solHide");
			expect(session.last.solution.hidden).toBe(true);
			await session.click("#solBtn");
			const off = path[3] === "N" ? "S" : "N";
			await session.press(keyFor(off), "roll away from the solution re-plans it");
			await session.press("r");
			await session.click("#solBtn");
			const solved = await session.roll(path);
			expect(solved.win).toStrictEqual(
				{
					hidden: false,
					title: "Solved",
					score: "19 moves · par 19",
					note: "You followed the solution this time. Replay it from memory when you are ready.",
					nextHidden: false,
					retryHidden: false,
				},
			);
		},
	);
});

test("title screen: progress text, tutorial replay, reset arm, timeout and confirm", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(4),
		},
		async (session) =>
		{
			const title = async () => session.page.locator("#titleProgress").textContent();
			expect(await title()).toBe("4 of 31 levels cleared");
			await session.click("#tipsReplay");
			await session.fireParkedTimers();
			await session.click("#resetProgress");
			await session.fireParkedTimers();
			await session.click("#resetProgress", "arm");
			const erased = await session.click("#resetProgress", "confirm");
			expect(erased.storage).toStrictEqual(
				{
					"cubist-progress-v2": "{}",
				},
			);
			expect(await title()).toBe("31 levels");
			await session.fireParkedTimers();
			await session.reload();
			await session.press("Space", "space starts the game when no button has focus");
			const tips = await session.dismissTips();
			expect(tips).toStrictEqual(["Rolling"]);
			expect(session.last.storage["cubist-tips-seen-v1"]).toBe(
				JSON.stringify(
					{
						roll: true,
					},
				),
			);
		},
	);
});

test("navigation: brand, mode buttons, levels list, hash and window resize", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(6),
		},
		async (session) =>
		{
			await openLevel(session);
			await session.click(".lvbtn:nth-child(2)", "go back to an unlocked level");
			expect(session.last.hud.num).toBe("Level 2 of 31");
			await session.click("#modeEdit");
			expect(session.last.location).toBe("#editor");
			await session.click("#modePlay");
			expect(session.last.location).toBe("");
			await session.resize(700, 600);
			await session.click(".brand");
			await session.click("#titleEdit");
			await session.resize(1000, 700);
			await session.click(".brand");
			await session.step("hash navigation to the editor", async (page) =>
				page.evaluate(() => (location.hash = "#editor")),
			);
			expect(session.last.location).toBe("#editor");
			await session.reload();
			await session.step("hash cleared", async (page) => page.evaluate(() => (location.hash = "")));
		},
	);
});

const RESUME =
{
	lvl: 1,
	name: "First Coat",
	st:
	{
		x: 2,
		y: 1,
		f:
		{
			t: "",
			b: "r",
			n: "",
			s: "",
			e: "",
			w: "",
		},
		boxes: [],
		sw: [],
	},
	hist: [],
};

test("window.claude.hot hooks: data resumes a level, with and without ready", async ({browser}) =>
{
	for (const useReady of [false, true])
	{
		await withSession(
			browser,
			{
				storage: atLevel(1),
				hot:
				{
					data: RESUME,
					useReady,
				},
			},
			async (session) =>
			{
				expect(session.last.audio).toStrictEqual([["hot.snapshot", "function"]]);
				const snapshots = await Promise.all(
					[session.page].map(async (page) =>
						page.evaluate(() =>
							(
								window as unknown as
								{
									__hotSnapshot: () => unknown;
								}
							).__hotSnapshot(),
						),
					),
				);
				expect(snapshots[0]).toStrictEqual(
					{
						...RESUME,
						mode: "title",
					},
				);
				await session.click("#titlePlay");
				expect(session.last.hud.moves).toBe("0");
			},
		);
	}
});

test("level data order and names reach the page unchanged", async ({browser}) =>
{
	const everything = Object.fromEntries(golden.map((g) => [g.name, g.par]));
	await withSession(
		browser,
		{
			storage:
			{
				...atLevel(0),
				"cubist-progress-v2": JSON.stringify(everything),
			},
		},
		async (session) =>
		{
			await openLevel(session);
			for (const {index, name, par} of golden)
			{
				const shown = await session.click(`.lvbtn:nth-child(${index + 1})`, `open level ${index + 1}`);
				expect(shown.hud).toStrictEqual(
					{
						name,
						num: `Level ${index + 1} of 31`,
						moves: "0",
						par: String(par),
					},
				);
			}
		},
	);
});
