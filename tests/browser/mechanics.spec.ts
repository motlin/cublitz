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
// Each reason a roll is refused has its own status, covered in tests/unit/ui/blocked.test.ts. This one proves the wiring.
test("blocked move: color gate, bare face", async ({browser}) =>
{
	const index = 2;
	const found = findBlockedMove(engine, level(index), "gate", (r) => !r["down"]);
	if (!found) throw new Error(`No gate block on level ${index}`);
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
			expect(blocked.status).toStrictEqual(
				{
					text: "Blue gate. Rolling east would put a bare face down.",
					html: "<b>Blue gate.</b> Rolling east would put a bare face down.",
					warn: true,
				},
			);
			expect(blocked.hud.moves).toBe(moves);
			expect(blocked.audio.length).toBeGreaterThan(0);
			await session.press(keyFor(found.dir), "blocked roll again");
		},
	);
});

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
			// One task sends all three, so the second and third land while the first roll is still animating.
			const after = await session.step("three fast rolls", async (page) =>
				page.evaluate(() =>
				{
					for (const key of ["ArrowRight", "ArrowLeft", "ArrowRight"])
						document.dispatchEvent(
							new KeyboardEvent(
								"keydown",
								{
									key,
								},
							),
						);
				}),
			);
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

// Which milestone each hint points at, and the tier it opens at, is covered level by level in
// tests/unit/core/hint-walk.test.ts. This one walks a level to prove the panel shows them.
const milestone = (text: string): string =>
{
	if (text.includes(" gate.")) return "gate";
	if (text.includes("Head for the target")) return "goal";
	return `unknown: ${text}`;
};

test("hints at every tier while solving level 2", async ({browser}) =>
{
	const index = 1;
	await withSession(
		browser,
		{
			storage: atLevel(index),
		},
		async (session) =>
		{
			await openLevel(session);
			const seen: string[] = [];
			let i = 0;
			for (const d of pathOf(index))
			{
				const tier1 = await session.press("h", `hint at roll ${i}`);
				expect(tier1.hint.hidden).toBe(false);
				seen.push(`${milestone(tier1.hint.text)} ${tier1.hint.step}`);
				// A hint keeps its tier while the milestone stays the same, and starts over at a new one.
				let tier = tier1.hint.step;
				if (tier === "Hint 1 of 3") tier = (await session.click("#hintMore")).hint.step;
				if (tier === "Hint 2 of 3") tier = (await session.click("#hintMore")).hint.step;
				expect(tier).toBe("Hint 3 of 3");
				await session.press(keyFor(d), `roll after hint ${i}`);
				i++;
			}
			expect(seen).toStrictEqual([
				"gate Hint 1 of 3",
				"gate Hint 3 of 3",
				"gate Hint 3 of 3",
				"gate Hint 3 of 3",
				"gate Hint 3 of 3",
				"goal Hint 1 of 3",
			]);
			expect(session.last.win.hidden).toBe(false);
		},
	);
});

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

test("two quick rolls off the solution leave a solution that works from where the cube is", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
			reducedMotion: true,
		},
		async (session) =>
		{
			await openLevel(session);
			await session.click("#solBtn");
			// North leaves the solution and starts a re-plan, and east lands before it runs
			await session.step("roll off the path, then along the old one", async (page) =>
				page.evaluate(
					`for (const key of ["ArrowUp", "ArrowRight"]) document.dispatchEvent(new KeyboardEvent("keydown", {key}))`,
				),
			);
			const replay = await session.page.evaluate(`(() =>
			{
				let st = S.st;
				for (const d of solState.path)
				{
					const r = tryMove(S.L, st, d);
					if (!r.ok) return {at: solState.at === S.st, works: false};
					st = r.st;
					if (r.won) return {at: solState.at === S.st, works: true};
				}
				return {at: solState.at === S.st, works: false};
			})()`);
			expect(replay).toStrictEqual(
				{
					at: true,
					works: true,
				},
			);
		},
	);
});

// Where "up to goal" stops and how following or leaving the path changes it are covered in
// tests/unit/ui/solution.test.ts. This one presses each button once on a short level.
test("solution reveal: next, up to goal, reveal the rest, pause, follow, diverge, undo, win as Solved", async ({
	browser,
}) =>
{
	const index = 1;
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
			await session.click("#solAll");
			await session.tickIntervals(1);
			await session.click("#solAll", "pause the auto reveal");
			const paused = await session.tickIntervals(1);
			expect(paused.solution).toStrictEqual(
				{
					hidden: false,
					text: `Showing 3 of ${path.length} rolls. Follow the arrows in number order, or reveal more.`,
				},
			);
			await session.click("#solNext");
			const goal = await session.click("#solGoal");
			expect(goal.solution).toStrictEqual(
				{
					hidden: false,
					text: `Showing 5 of ${path.length} rolls. Follow the arrows in number order, or reveal more.`,
				},
			);
			await session.click("#solAll", "resume the auto reveal");
			const all = await session.tickIntervals(path.length);
			expect(all.solution).toStrictEqual(
				{
					hidden: false,
					text: `Full solution shown: ${path.length} rolls from where you are. Follow the arrows in number order; each one disappears as you roll it.`,
				},
			);
			const followed = await session.roll(path.slice(0, 3));
			expect(followed.solution).toStrictEqual(
				{
					hidden: false,
					text: `Full solution shown: ${path.length - 3} rolls from where you are. Follow the arrows in number order; each one disappears as you roll it.`,
				},
			);
			await session.press("z", "undo keeps the reveal");
			await session.click("#solHide");
			expect(session.last.solution.hidden).toBe(true);
			await session.click("#solBtn");
			const diverged = await session.press("ArrowUp", "roll away from the solution re-plans it");
			expect([diverged.hud.moves, diverged.solution.hidden]).toStrictEqual(["3", false]);
			await session.press("r");
			await session.click("#solBtn");
			const solved = await session.roll(path);
			expect(solved.win).toStrictEqual(
				{
					hidden: false,
					title: "Solved",
					score: "6 moves · par 6",
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

test("a window resize during a roll refits the board once the roll ends", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openLevel(session);
			const before = await session.page.evaluate("C()");
			// One step, since settling waits out the retries a held roll keeps scheduling
			await session.step("resize mid-roll, then the roll ends", async (page) =>
			{
				await page.evaluate("S.busy = true");
				await page.setViewportSize(
					{
						width: 420,
						height: 400,
					},
				);
				await page.evaluate(() => window.dispatchEvent(new Event("resize")));
				await page.waitForTimeout(300);
				await page.evaluate("S.busy = false");
				await page.waitForTimeout(300);
			});
			const after = await session.page.evaluate("C()");
			await session.page.evaluate("renderBoard()");
			expect([after === before, after]).toStrictEqual([false, await session.page.evaluate("C()")]);
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
