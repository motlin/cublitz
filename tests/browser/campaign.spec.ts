import {expect, test} from "@playwright/test";
import {readSolveGolden} from "../support/golden.ts";
import {keyFor} from "../support/paths.ts";
import {atLevel} from "./harness/page.ts";
import {type Session, withSession} from "./harness/session.ts";

const golden = readSolveGolden("solve-post-fix.json");
const WASD: Record<string, string> =
{
	N: "w",
	S: "s",
	E: "d",
	W: "a",
};
const LAST = golden.length - 1;

// All three keyboard schemes get exercised on every level played here.
const mixedKeys = (direction: string, index: number): string =>
	index % 3 === 0 ? keyFor(direction) : index % 3 === 1 ? WASD[direction]! : WASD[direction]!.toUpperCase();

// Every level's golden path winning at par, its tips, win card text and saved score are unit tests
// (tests/unit/core/levels.test.ts, tests/unit/ui/helpers.test.ts, win-card.test.ts and session.test.ts).
// These levels cover each tip family and the last level's replay, to check the page wires them up.
const REPRESENTATIVE: Record<number, string[]> =
{
	0: ["Rolling"],
	1: ["Rolling", "Wet paint", "Color gates"],
	7: ["Rolling", "Wet paint", "Color gates", "Picky targets"],
	8: ["Rolling", "Wet paint", "Solid cubes and switches"],
	9: ["Rolling", "Wet paint", "Buttons and boxes"],
	26: ["Rolling", "Wet paint", "White gates", "Paint remover"],
	[LAST]: ["Rolling", "Wet paint", "Solid cubes and switches", "Buttons and boxes", "Paint remover", "White pieces"],
};

for (const [key, expectedTips] of Object.entries(REPRESENTATIVE))
{
	const {index, name, par, path} = golden[Number(key)]!;
	test(`level ${index + 1} ${name}: solver path to a win, with its tutorial tips`, async ({browser}) =>
	{
		await withSession(
			browser,
			{
				storage: atLevel(index, false),
			},
			async (session) =>
			{
				await session.click("#titlePlay");
				expect(session.last.hud.num).toBe(`Level ${index + 1} of 31`);
				expect(await session.dismissTips()).toStrictEqual(expectedTips);
				const won = await session.roll(path!, mixedKeys);
				expect(won.win).toStrictEqual(
					{
						hidden: false,
						title: "Perfect roll",
						score: `${par} moves · par ${par}`,
						note:
							index === LAST
								? "That was the last canvas. Replay any level to chase par, or build your own in the editor."
								: "You matched the shortest solution.",
						nextHidden: index === LAST,
						retryHidden: false,
					},
				);
				expect(won.status.text).toBe("Cleared.");
				expect(JSON.parse(won.storage["cubist-progress-v2"]!)[name]).toBe(par);
				if (index === LAST)
				{
					const replay = await session.click("#winRetry");
					expect(replay.hud).toStrictEqual(
						{
							name,
							num: "Level 31 of 31",
							moves: "0",
							par: String(par),
						},
					);
				}
				else
				{
					const next = await session.click("#winNext");
					expect(next.hud.num).toBe(`Level ${index + 2} of 31`);
				}
			},
		);
	});
}

/** Plays levels first to last from the current one, checking each win unlocks exactly one more level. */
async function unlockInTurn(session: Session, first: number, last: number): Promise<void>
{
	const enabled = async () => session.page.locator(".lvbtn:not([disabled])").count();
	for (const {index, path} of golden.slice(first, last + 1))
	{
		expect(session.last.hud.num).toBe(`Level ${index + 1} of 31`);
		await session.dismissTips();
		expect(await enabled()).toBe(index + 1);
		const won = await session.roll(path!);
		expect(won.win.hidden).toBe(false);
		expect(await enabled()).toBe(Math.min(31, index + 2));
		if (index < LAST) await session.press("Enter", "next level with Enter");
	}
}

test("fresh save: levels 1 to 3 unlock one by one, with reduced motion", async ({browser}) =>
{
	await withSession(
		browser,
		{
			reducedMotion: true,
		},
		async (session) =>
		{
			await session.press("Enter", "start from the title with Enter");
			await unlockInTurn(session, 0, 2);
			expect(session.last.hud.num).toBe("Level 4 of 31");
		},
	);
});

// The rest of the campaign in chunks that start from a save at a level boundary, so each level unlocking the next
// is still checked once without one test playing all 771 moves.
const CHUNKS: [first: number, last: number][] = [
	[3, 7],
	[8, 11],
	[12, 14],
	[15, 18],
	[19, 25],
	[26, 29],
];
for (const [first, last] of CHUNKS)
{
	test(`saved progress: levels ${first + 1} to ${last + 1} unlock one by one, with reduced motion`, async ({
		browser,
	}) =>
	{
		await withSession(
			browser,
			{
				reducedMotion: true,
				storage: atLevel(first),
			},
			async (session) =>
			{
				await session.click("#titlePlay");
				await unlockInTurn(session, first, last);
				expect(session.last.hud.num).toBe(`Level ${last + 2} of 31`);
			},
		);
	});
}

test("saved progress: beating level 31 clears the campaign, which survives a reload, with reduced motion", async ({
	browser,
}) =>
{
	await withSession(
		browser,
		{
			reducedMotion: true,
			storage: atLevel(LAST),
		},
		async (session) =>
		{
			await session.click("#titlePlay");
			await unlockInTurn(session, LAST, LAST);
			await session.click(".brand");
			expect(await session.page.locator("#titleProgress").textContent()).toBe("All 31 levels cleared");
			expect(await session.page.locator("#titlePlay").textContent()).toBe("Play again");
			await session.reload();
			expect(await session.page.locator("#titleProgress").textContent()).toBe("All 31 levels cleared");
		},
	);
});
