import {expect, test} from "@playwright/test";
import {readSolveGolden} from "../support/golden.ts";
import {atLevel, engine, type Pair, withPair} from "./harness/pair.ts";

// Behavior a session never reaches on its own, so each one is driven here on purpose.

const golden = readSolveGolden("solve-post-fix.json");

const ROLL_KEYS = ["w", "a", "s", "d", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];

for (const modifier of ["Meta", "Control", "Alt"])
{
	test(`game keys with ${modifier} held do nothing`, async ({browser}) =>
	{
		await withPair(
			browser,
			{
				storage: atLevel(1),
			},
			async (pair) =>
			{
				await pair.click("#titlePlay");
				for (const key of ROLL_KEYS)
				{
					const pressed = await pair.press(`${modifier}+${key}`);
					expect(
						{
							moves: pressed.hud.moves,
							prevented: pressed.prevented,
						},
					).toStrictEqual(
						{
							moves: "0",
							prevented: [],
						},
					);
				}
			},
		);
	});

	test(`the M key with ${modifier} held leaves the sound alone`, async ({browser}) =>
	{
		await withPair(
			browser,
			{
				storage: atLevel(1),
			},
			async (pair) =>
			{
				const pressed = await pair.press(`${modifier}+m`);
				expect(pressed.storage).toStrictEqual(atLevel(1));
			},
		);
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

for (const key of SAVED_KEYS)
{
	test(`unparseable JSON in ${key} boots and walks every mode without an error`, async ({browser}) =>
	{
		await withPair(
			browser,
			{
				storage:
				{
					...atLevel(1),
					[key]: "{bad",
				},
			},
			async (pair) =>
			{
				expect(pair.last.errors).toStrictEqual([]);
				await pair.click("#titleEdit");
				await pair.click("#modePlay");
				await pair.press("h");
				const reloaded = await pair.reload();
				expect(reloaded.errors).toStrictEqual([]);
			},
		);
	});
}

const finishFirstCanvas = async (pair: Pair, seed: number) =>
{
	await pair.click("#titleInf");
	await pair.dismissTips();
	const level = engine.parseLevel(JSON.parse(JSON.stringify(engine.generateInfinite(seed, 0))));
	return pair.roll(engine.solve(level, engine.initState(level), 400000)!);
};

test("the rating averages the last ten canvases, dropping the eleventh back", async ({browser}) =>
{
	const seed = 12345;
	const effs = [1, 0, ...Array<number>(8).fill(1)];
	const run =
	{
		seed,
		n: 0,
		score: 0,
		effs,
		cleared: 10,
		streak: 0,
		bestStreak: 0,
	};
	await withPair(
		browser,
		{
			storage:
			{
				...atLevel(0),
				"cublitz-infinite-run-v1": JSON.stringify(run),
			},
		},
		async (pair) =>
		{
			const won = await finishFirstCanvas(pair, seed);
			const saved = JSON.parse(won.storage["cublitz-infinite-run-v1"]!) as
			{
				effs: number[];
			};
			expect(saved.effs).toStrictEqual([...effs, 1]);
			expect(
				(
					JSON.parse(won.storage["cublitz-infinite-best-v1"]!) as
					{
						rating: number;
					}
				).rating,
			).toBe(90);
			const ratings = await Promise.all(
				pair.pages.map(async (page) =>
					page.evaluate(
						"[infRating({effs:[0,1,1,1,1,1,1,1,1,1]}), infRating({effs:[0,0,1,1,1,1,1,1,1,1,1]})]",
					),
				),
			);
			expect(ratings).toStrictEqual([
				[90, 90],
				[90, 90],
			]);
		},
	);
});

test("hot data for a locked level is ignored and the first open level loads", async ({browser}) =>
{
	const data =
	{
		lvl: 20,
		name: engine.LEVELS[20]!.name,
		st:
		{
			x: 0,
			y: 0,
			f:
			{
				t: "",
				b: "",
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
	for (const useReady of [false, true])
	{
		await withPair(
			browser,
			{
				storage: atLevel(1),
				hot:
				{
					data,
					useReady,
				},
			},
			(pair) =>
			{
				expect(pair.last.hud.num).toBe("Level 2 of 31");
				expect(pair.last.errors).toStrictEqual([]);
			},
		);
	}
});

// Before Crown and Checkpoints swapped places, Checkpoints was level 5, so a save or a hot snapshot from then can
// hold Checkpoints beaten ahead of Crown, or a Checkpoints state stored under index 4, which is now Crown's.
const OLD_ORDER_SAVE =
{
	...atLevel(4),
	"cubist-progress-v2": JSON.stringify(
		{
			...JSON.parse(atLevel(4)["cubist-progress-v2"]!),
			Checkpoints: 21,
		},
	),
};

test("hot data from the old order, a Checkpoints state under index 4, is not restored onto Crown", async ({browser}) =>
{
	const st =
	{
		x: 0,
		y: 1,
		f:
		{
			t: "",
			b: "",
			n: "",
			s: "",
			e: "",
			w: "",
		},
		boxes: [],
		sw: [],
	};
	for (const useReady of [false, true])
	{
		await withPair(
			browser,
			{
				storage: OLD_ORDER_SAVE,
				hot:
				{
					data:
					{
						lvl: 4,
						st,
						hist: [st],
					},
					useReady,
				},
			},
			async (pair) =>
			{
				const opened = await pair.click("#titlePlay");
				expect(opened.hud).toStrictEqual(
					{
						name: "Crown",
						num: "Level 5 of 31",
						moves: "0",
						par: "17",
					},
				);
				expect(opened.errors).toStrictEqual([]);
			},
		);
	}
});

test("Next level after Crown skips Checkpoints when an old save already beat it", async ({browser}) =>
{
	await withPair(
		browser,
		{
			storage: OLD_ORDER_SAVE,
		},
		async (pair) =>
		{
			await pair.click("#titlePlay");
			const won = await pair.roll(golden[4]!.path!);
			expect(won.win.hidden).toBe(false);
			const next = await pair.click("#winNext");
			expect(next.hud).toStrictEqual(
				{
					name: "Stripes",
					num: "Level 7 of 31",
					moves: "0",
					par: "26",
				},
			);
		},
	);
});

test("Next level after Checkpoints goes back to Crown when an old save beat Checkpoints but not Crown", async ({
	browser,
}) =>
{
	await withPair(
		browser,
		{
			storage: OLD_ORDER_SAVE,
		},
		async (pair) =>
		{
			await pair.click("#titlePlay");
			await pair.click('#levels button[title^="Checkpoints"]');
			const won = await pair.roll(golden[5]!.path!);
			expect(won.win.hidden).toBe(false);
			const next = await pair.click("#winNext");
			expect(next.hud).toStrictEqual(
				{
					name: "Crown",
					num: "Level 5 of 31",
					moves: "0",
					par: "17",
				},
			);
		},
	);
});

test("the white gates tip and level 23's tip no longer say that paint never comes off", async ({browser}) =>
{
	const seenExceptWhiteGates =
	{
		roll: true,
		paint: true,
		gate: true,
		need: true,
		switch: true,
		button: true,
	};
	const storage =
	{
		...atLevel(22),
		"cubist-tips-seen-v1": JSON.stringify(seenExceptWhiteGates),
	};
	await withPair(
		browser,
		{
			storage,
		},
		async (pair) =>
		{
			const opened = await pair.click("#titlePlay");
			expect([opened.hud.name, opened.tip.title]).toStrictEqual(["Two Sides", "White gates"]);
			const shown = await Promise.all(
				pair.pages.map(async (page) => [
					await page.locator("#tipBody").textContent(),
					await page.locator("#lvTip").textContent(),
				]),
			);
			const expected = [
				"White gates want a bare side. A plain one needs a bare face down. An arrow means the side it points to must still be bare when you land, and a ring means a bare top. Paint stays on until a paint remover wipes it, so every puddle you cross uses up a white face. A solid cube never gets through.",
				"West bare for the first wall, top bare for the second. Nothing here takes paint off.",
			];
			expect(shown).toStrictEqual([expected, expected]);
		},
	);
});

test("the rolling tip is two short sentences", async ({browser}) =>
{
	await withPair(
		browser,
		{
			storage: atLevel(0, false),
		},
		async (pair) =>
		{
			const opened = await pair.click("#titlePlay");
			expect(opened.tip.title).toBe("Rolling");
			const shown = await Promise.all(pair.pages.map(async (page) => page.locator("#tipBody").textContent()));
			const expected = "Swipe or use the arrows to roll. Roll the cube to the target.";
			expect(shown).toStrictEqual([expected, expected]);
		},
	);
});

test("the infinite mode tip is short", async ({browser}) =>
{
	await withPair(
		browser,
		{
			storage: atLevel(0),
		},
		async (pair) =>
		{
			await pair.click("#titleInf");
			const shown = await Promise.all(pair.pages.map(async (page) => page.locator("#lvTip").textContent()));
			expect(shown[0]).toMatch(
				/^Every canvas is new\. Par is \d+\. You can undo, but every roll counts toward your score\.$/,
			);
			expect(shown[1]).toBe(shown[0]);
		},
	);
});

// Violet Vault, Fresh Start and Clean Sweep between them bring up every tutorial pop-up after the rolling tip.
test("the tutorial pop-ups after the rolling tip are reworded", async ({browser}) =>
{
	const shown: Record<string, (string | null)[]> = {};
	for (const index of [18, 25, 29])
	{
		await withPair(
			browser,
			{
				storage: atLevel(index, false),
			},
			async (pair) =>
			{
				await pair.click("#titlePlay");
				while (!pair.last.tip.hidden)
				{
					const title = pair.last.tip.title;
					shown[title] = await Promise.all(
						pair.pages.map(async (page) => page.locator("#tipBody").textContent()),
					);
					await pair.press("Enter", `dismiss tip ${title}`);
				}
			},
		);
	}
	const both = (text: string): (string | null)[] => [text, text];
	expect(shown).toStrictEqual(
		{
			Rolling: both("Swipe or use the arrows to roll. Roll the cube to the target."),
			"Wet paint": both(
				"Roll onto a puddle and the face touching the floor takes its color. It stays that color until another puddle covers it. The face map on the right shows every side.",
			),
			"Color gates": both(
				"A colored gate only lets you through if the face that lands on it is that color. Every roll turns a different face down, so count your rolls.",
			),
			"Picky targets": both(
				"A colored target wants that color on top. A colored bar on one edge means that side of the cube needs the color too. The face map on the right shows every side.",
			),
			"Solid cubes and switches": both(
				"A switch only works for a cube painted its color on all six faces. A solid cube glows. Roll it onto a matching switch to flip it, and every door of that color opens.",
			),
			"Buttons and boxes": both(
				"A button holds its doors open only while something of its color sits on it. Step off and they shut. A solid cube can push a box of its own color, and a box left on the button keeps the doors open for good.",
			),
			"White gates": both(
				"White gates want a bare side. A plain one needs a bare face down. An arrow means the side it points to must still be bare when you land, and a ring means a bare top. Paint stays on until a paint remover wipes it, so every puddle you cross uses up a white face. A solid cube never gets through.",
			),
			"Paint remover": both(
				"A paint remover wipes every face of your cube back to bare at once. Use it when puddles or a solid coat have used up the bare sides a white gate needs. It ends a solid coat too, so finish with switches and boxes first.",
			),
			"White pieces": both(
				"A cube with no paint on any face counts as white. It doesn’t glow or act solid, but it can flip white switches, hold down white buttons and push white boxes. Picked up paint? A paint remover makes you white again.",
			),
		},
	);
});

// A search that really reaches 400000 states takes many seconds, so the set of seen states reports its size.
test("the solver's default limit is 400000 states", async ({browser}) =>
{
	const solveAtSize = (size: number): string => `(() => {
		const RealSet = window.Set;
		window.Set = class extends RealSet { get size() { return ${size}; } };
		const path = solve(LEVELS[0], initState(LEVELS[0]));
		window.Set = RealSet;
		return [path, solve.hitLimit];
	})()`;
	await withPair(browser, {}, async (pair) =>
	{
		const results = async (size: number) =>
			Promise.all(pair.pages.map(async (page) => page.evaluate(solveAtSize(size))));
		const path = golden[0]?.path;
		expect(await results(399_999)).toStrictEqual([
			[path, false],
			[path, false],
		]);
		expect(await results(400_000)).toStrictEqual([
			[null, true],
			[null, true],
		]);
	});
});

test("confirming the reset cancels the disarm timer, so only the note's own timer is left", async ({browser}) =>
{
	await withPair(
		browser,
		{
			storage: atLevel(4),
		},
		async (pair) =>
		{
			await pair.click("#resetProgress", "arm");
			const armed = pair.last;
			expect(armed.timers).toStrictEqual([["timeout", 5000]]);
			const confirmed = await pair.click("#resetProgress", "confirm");
			expect(confirmed.timers).toStrictEqual([
				["clearTimeout", 5000],
				["timeout", 3000],
			]);
			await pair.fireParkedTimers();
			expect(await pair.legacy.locator("#resetNote").isHidden()).toBe(true);
			expect(await pair.dist.locator("#resetNote").isHidden()).toBe(true);
		},
	);
});
