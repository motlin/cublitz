import {afterEach, expect, test, vi} from "vite-plus/test";
import {LEVELS} from "../../../src/core/levels.ts";
import {beaten, eraseProgress, loadProgress, nextLevel, unlocked} from "../../../src/ui/session.ts";
import {STORAGE_KEYS} from "../../../src/ui/storage.ts";

const withSave = (progress: Record<string, number>) => {
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => (key === STORAGE_KEYS.progress ? JSON.stringify(progress) : null),
		setItem: () => {},
		removeItem: () => {},
	});
	loadProgress();
};
// Progress lives in the session module, so it is cleared while the stub still takes the write.
afterEach(() => {
	eraseProgress();
	vi.unstubAllGlobals();
});

const open = () =>
	LEVELS.map((level, index) => [level.name, unlocked(index), beaten(level) ?? null]).filter(([, isOpen]) => isOpen);

// Progress is keyed by level name, so a save from the original order, where Checkpoints came before Crown,
// still works with Crown fifth and Checkpoints sixth.
test("a save that beat Checkpoints but not Crown keeps Checkpoints' score and opens Crown and Stripes", () => {
	withSave({"First Roll": 6, "First Coat": 6, "Blue Fence": 12, "Keep the Red": 19, Checkpoints: 21});
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

test("a save that stopped before Checkpoints opens Crown next and keeps Checkpoints locked", () => {
	withSave({"First Roll": 6, "First Coat": 6, "Blue Fence": 12, "Keep the Red": 19});
	expect(open()).toStrictEqual([
		["First Roll", true, 6],
		["First Coat", true, 6],
		["Blue Fence", true, 12],
		["Keep the Red", true, 19],
		["Crown", true, null],
	]);
});

test("a save that beat both keeps both scores and opens Stripes", () => {
	withSave({"First Roll": 6, "First Coat": 6, "Blue Fence": 12, "Keep the Red": 19, Checkpoints: 19, Crown: 17});
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

test("Next level after Crown skips Checkpoints when an old save already beat it", () => {
	withSave({"First Roll": 6, "First Coat": 6, "Blue Fence": 12, "Keep the Red": 19, Checkpoints: 21, Crown: 17});
	expect(LEVELS[nextLevel(CROWN)]?.name).toBe("Stripes");
});

test("Next level after Crown goes to Checkpoints when it is not beaten yet", () => {
	withSave({"First Roll": 6, "First Coat": 6, "Blue Fence": 12, "Keep the Red": 19, Crown: 17});
	expect(LEVELS[nextLevel(CROWN)]?.name).toBe("Checkpoints");
});

const CHECKPOINTS = LEVELS.findIndex((level) => level.name === "Checkpoints");

test("Next level after Checkpoints goes back to Crown when an old save beat Checkpoints but not Crown", () => {
	withSave({"First Roll": 6, "First Coat": 6, "Blue Fence": 12, "Keep the Red": 19, Checkpoints: 21});
	expect(LEVELS[nextLevel(CHECKPOINTS)]?.name).toBe("Crown");
});

test("Next level after replaying level 3 with levels 1 to 7 beaten goes to level 8", () => {
	withSave(Object.fromEntries(LEVELS.slice(0, 7).map((level) => [level.name!, 99])));
	expect(nextLevel(2)).toBe(7);
});

test("Next level goes to the following level when every level is beaten, and stays on the last level", () => {
	withSave(Object.fromEntries(LEVELS.map((level) => [level.name!, 99])));
	expect([nextLevel(0), nextLevel(CROWN), nextLevel(LEVELS.length - 1)]).toStrictEqual([
		1,
		CROWN + 1,
		LEVELS.length - 1,
	]);
});
