import {afterEach, expect, test, vi} from "vite-plus/test";
import {LEVELS} from "../../../src/core/levels.ts";
import {beaten, loadProgress, unlocked} from "../../../src/ui/session.ts";
import {STORAGE_KEYS} from "../../../src/ui/storage.ts";

const withSave = (progress: Record<string, number>) => {
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => (key === STORAGE_KEYS.progress ? JSON.stringify(progress) : null),
		setItem: () => {},
		removeItem: () => {},
	});
	loadProgress();
};
afterEach(() => vi.unstubAllGlobals());

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
