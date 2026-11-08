import {afterEach, expect, test, vi} from "vite-plus/test";
import {LEVELS} from "../../../src/core/levels.ts";
import {beaten, eraseProgress, loadProgress, nextLevel, recordWin, unlocked} from "../../../src/ui/session.ts";
import {STORAGE_KEYS} from "../../../src/ui/storage.ts";

/** What the game wrote to localStorage since the save was loaded. */
let written: Record<string, string> = {};
const withSave = (progress: Record<string, number>) =>
{
	written = {};
	vi.stubGlobal(
		"localStorage",
		{
			getItem: (key: string) => (key === STORAGE_KEYS.progress ? JSON.stringify(progress) : null),
			setItem: (key: string, value: string) =>
			{
				written[key] = value;
			},
			removeItem: () =>
			{
			},
		},
	);
	loadProgress();
};
// Progress lives in the session module, so it is cleared while the stub still takes the write.
afterEach(() =>
{
	eraseProgress();
	vi.unstubAllGlobals();
});

const open = () =>
	LEVELS.map((level, index) => [level.name, unlocked(index), beaten(level) ?? null]).filter(([, isOpen]) => isOpen);

// Progress is keyed by level name, so a save from the original order, where Checkpoints came before Crown,
// still works with Crown fifth and Checkpoints sixth.
test("a save that beat Checkpoints but not Crown keeps Checkpoints' score and opens Crown and Stripes", () =>
{
	withSave(
		{
			"First Roll": 6,
			"First Coat": 6,
			"Blue Fence": 12,
			"Keep the Red": 19,
			Checkpoints: 21,
		},
	);
	expect(open()).toStrictEqual([
		["First Roll", true, 6],
		["First Coat", true, 6],
		["Blue Fence", true, 12],
		["Keep the Red", true, 19],
		["Crown", true, null],
		["Checkpoints", true, 21],
		["Stripes", true, null],
	]);
});

test("a save that stopped before Checkpoints opens Crown next and keeps Checkpoints locked", () =>
{
	withSave(
		{
			"First Roll": 6,
			"First Coat": 6,
			"Blue Fence": 12,
			"Keep the Red": 19,
		},
	);
	expect(open()).toStrictEqual([
		["First Roll", true, 6],
		["First Coat", true, 6],
		["Blue Fence", true, 12],
		["Keep the Red", true, 19],
		["Crown", true, null],
	]);
});

test("a save that beat both keeps both scores and opens Stripes", () =>
{
	withSave(
		{
			"First Roll": 6,
			"First Coat": 6,
			"Blue Fence": 12,
			"Keep the Red": 19,
			Checkpoints: 19,
			Crown: 17,
		},
	);
	expect(open()).toStrictEqual([
		["First Roll", true, 6],
		["First Coat", true, 6],
		["Blue Fence", true, 12],
		["Keep the Red", true, 19],
		["Crown", true, 17],
		["Checkpoints", true, 19],
		["Stripes", true, null],
	]);
});

const CROWN = LEVELS.findIndex((level) => level.name === "Crown");

test("Next level after Crown skips Checkpoints when an old save already beat it", () =>
{
	withSave(
		{
			"First Roll": 6,
			"First Coat": 6,
			"Blue Fence": 12,
			"Keep the Red": 19,
			Checkpoints: 21,
			Crown: 17,
		},
	);
	expect(LEVELS[nextLevel(CROWN)]?.name).toBe("Stripes");
});

test("Next level after Crown goes to Checkpoints when it is not beaten yet", () =>
{
	withSave(
		{
			"First Roll": 6,
			"First Coat": 6,
			"Blue Fence": 12,
			"Keep the Red": 19,
			Crown: 17,
		},
	);
	expect(LEVELS[nextLevel(CROWN)]?.name).toBe("Checkpoints");
});

const CHECKPOINTS = LEVELS.findIndex((level) => level.name === "Checkpoints");

test("Next level after Checkpoints goes back to Crown when an old save beat Checkpoints but not Crown", () =>
{
	withSave(
		{
			"First Roll": 6,
			"First Coat": 6,
			"Blue Fence": 12,
			"Keep the Red": 19,
			Checkpoints: 21,
		},
	);
	expect(LEVELS[nextLevel(CHECKPOINTS)]?.name).toBe("Crown");
});

test("Next level after replaying level 3 with levels 1 to 7 beaten goes to level 8", () =>
{
	withSave(Object.fromEntries(LEVELS.slice(0, 7).map((level) => [level.name!, 99])));
	expect(nextLevel(2)).toBe(7);
});

// Stinkley tinkles came after the original 30 levels, so saves from before it never name it.
const ORIGINAL_THIRTY = LEVELS.slice(0, LEVELS.findIndex((level) => level.name === "Clean Sweep") + 1);
const STINKLEY = LEVELS.findIndex((level) => level.name === "Stinkley tinkles");

test("a save that beat all 30 original levels keeps every score and opens Stinkley tinkles", () =>
{
	withSave(Object.fromEntries(ORIGINAL_THIRTY.map((level) => [level.name!, 99])));
	expect(open().slice(-3)).toStrictEqual([
		["Clean Push", true, 99],
		["Clean Sweep", true, 99],
		["Stinkley tinkles", true, null],
	]);
	expect(open().length).toBe(LEVELS.length);
});

test("a save that stopped before Clean Sweep keeps Stinkley tinkles locked", () =>
{
	withSave(Object.fromEntries(ORIGINAL_THIRTY.slice(0, -1).map((level) => [level.name!, 99])));
	expect([unlocked(STINKLEY - 1), unlocked(STINKLEY)]).toStrictEqual([true, false]);
});

test("Next level after Clean Sweep goes to Stinkley tinkles, and from any level when only it is unbeaten", () =>
{
	withSave(Object.fromEntries(ORIGINAL_THIRTY.map((level) => [level.name!, 99])));
	expect([nextLevel(STINKLEY - 1), nextLevel(0)].map((index) => LEVELS[index]?.name)).toStrictEqual([
		"Stinkley tinkles",
		"Stinkley tinkles",
	]);
});

test("Next level goes to the following level when every level is beaten, and stays on the last level", () =>
{
	withSave(Object.fromEntries(LEVELS.map((level) => [level.name!, 99])));
	expect([nextLevel(0), nextLevel(CROWN), nextLevel(LEVELS.length - 1)]).toStrictEqual([
		1,
		CROWN + 1,
		LEVELS.length - 1,
	]);
});

const openCount = () => LEVELS.filter((_, index) => unlocked(index)).length;

test("a fresh save that wins each level at par in turn saves every score and opens exactly one more level each time", () =>
{
	withSave({});
	const steps = LEVELS.map((level) =>
	{
		const before = openCount();
		recordWin(level, level.par!);
		return [level.name, before, openCount()];
	});
	expect(
		{
			steps,
			saved: JSON.parse(written[STORAGE_KEYS.progress]!),
		},
	).toStrictEqual(
		{
			steps: LEVELS.map((level, index) => [level.name, index + 1, Math.min(LEVELS.length, index + 2)]),
			saved: Object.fromEntries(LEVELS.map((level) => [level.name, level.par])),
		},
	);
});

test("a win keeps the best score: a slower replay leaves it and a faster one replaces it", () =>
{
	withSave(
		{
			"First Roll": 8,
		},
	);
	recordWin(LEVELS[0]!, 9);
	const afterSlower = [beaten(LEVELS[0]!), written[STORAGE_KEYS.progress] ?? null];
	recordWin(LEVELS[0]!, 6);
	expect([afterSlower, [beaten(LEVELS[0]!), written[STORAGE_KEYS.progress] ?? null]]).toStrictEqual([
		[8, null],
		[
			6,
			JSON.stringify(
				{
					"First Roll": 6,
				},
			),
		],
	]);
});
