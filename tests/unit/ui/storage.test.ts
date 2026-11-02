import {afterEach, expect, test, vi} from "vite-plus/test";
import * as storage from "../../../src/ui/storage.ts";

const stub = (entries: Record<string, string>) =>
{
	const data = new Map(Object.entries(entries));
	vi.stubGlobal(
		"localStorage",
		{
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => void data.set(key, value),
			removeItem: (key: string) => void data.delete(key),
		},
	);
	return data;
};
const refuse = () =>
{
	throw new Error("blocked");
};

const blocked = () =>
{
	vi.stubGlobal(
		"localStorage",
		{
			getItem: refuse,
			setItem: refuse,
			removeItem: refuse,
		},
	);
};
afterEach(() => vi.unstubAllGlobals());

test("the keys keep their legacy names", () =>
{
	expect(storage.STORAGE_KEYS).toStrictEqual(
		{
			progress: "cubist-progress-v2",
			tipsSeen: "cubist-tips-seen-v1",
			draft: "cubist-editor-draft-v1",
			mine: "cubist-my-levels-v1",
			colors: "cubist-colors-v1",
			sound: "cubist-sound-v1",
			infiniteRun: "cublitz-infinite-run-v1",
			infiniteBest: "cublitz-infinite-best-v1",
		},
	);
});

const EMPTY_BEST =
{
	cleared: 0,
	rating: 0,
	score: 0,
};
const READS: [string, string, () => unknown, unknown][] = [
	["progress", storage.STORAGE_KEYS.progress, storage.readProgress, {}],
	["tips", storage.STORAGE_KEYS.tipsSeen, storage.readTipsSeen, {}],
	["colors", storage.STORAGE_KEYS.colors, storage.readColors, {}],
	["run", storage.STORAGE_KEYS.infiniteRun, storage.readRun, null],
	["best", storage.STORAGE_KEYS.infiniteBest, storage.readBest, EMPTY_BEST],
	["draft", storage.STORAGE_KEYS.draft, storage.loadDraft, null],
	["mine", storage.STORAGE_KEYS.mine, storage.mine, []],
];

test.each(READS)("%s falls back when absent, unparsable, falsy or blocked", (_name, key, read, fallback) =>
{
	stub({});
	expect(read()).toStrictEqual(fallback);
	for (const stored of ["{oops", "null", "0", '""', "false"])
	{
		stub(
			{
				[key]: stored,
			},
		);
		expect(read()).toStrictEqual(fallback);
	}
	blocked();
	expect(read()).toStrictEqual(fallback);
});

test("a value that parses is not validated, whatever its shape", () =>
{
	for (const [, key, read] of READS.filter(([name]) => name !== "draft"))
	{
		stub(
			{
				[key]: "[7]",
			},
		);
		expect(read()).toStrictEqual([7]);
		stub(
			{
				[key]: "5",
			},
		);
		expect(read()).toStrictEqual(5);
	}
});

test("a draft only needs a truthy grid", () =>
{
	stub(
		{
			[storage.STORAGE_KEYS.draft]: '{"name":"no grid"}',
		},
	);
	expect(storage.loadDraft()).toBe(null);
	stub(
		{
			[storage.STORAGE_KEYS.draft]: '{"grid":1}',
		},
	);
	expect(storage.loadDraft()).toStrictEqual(
		{
			grid: 1,
		},
	);
});

test("writes keep the original formats", () =>
{
	const data = stub({});
	const level =
	{
		map: ["S.X"],
		name: "Mine",
	};
	const draft: storage.EditorDraft =
	{
		id: null,
		name: "Untitled",
		cols: 1,
		rows: 1,
		grid: [
			[
				{
					t: "paint",
					c: "r",
				},
				null,
			],
		],
		need:
		{
			t: "r",
		},
	};
	const run =
	{
		seed: 1,
		n: 2,
		score: 3,
		effs: [0.5],
		cleared: 4,
		streak: 5,
		bestStreak: 6,
	};
	expect([
		storage.writeProgress(
			{
				"First Roll": 4,
			},
		),
		storage.writeTipsSeen(
			{
				roll: true,
			},
		),
		storage.writeColors(
			{
				r: "#000000",
			},
		),
		storage.writeDraft(draft),
		storage.setMine([
			{
				id: "a",
				level,
				saved: 9,
			},
		]),
	]).toStrictEqual([true, true, true, true, true]);
	storage.writeRun(run);
	storage.writeBest(
		{
			cleared: 1,
			score: 2,
			rating: 3,
		},
	);
	storage.writeMuted(true);
	expect(Object.fromEntries(data)).toStrictEqual(
		{
			"cubist-progress-v2": '{"First Roll":4}',
			"cubist-tips-seen-v1": '{"roll":true}',
			"cubist-colors-v1": '{"r":"#000000"}',
			"cublitz-infinite-run-v1": '{"seed":1,"n":2,"score":3,"effs":[0.5],"cleared":4,"streak":5,"bestStreak":6}',
			"cublitz-infinite-best-v1": '{"cleared":1,"score":2,"rating":3}',
			"cubist-editor-draft-v1":
				'{"id":null,"name":"Untitled","cols":1,"rows":1,"grid":[[{"t":"paint","c":"r"},null]],"need":{"t":"r"}}',
			"cubist-my-levels-v1": '[{"id":"a","level":{"map":["S.X"],"name":"Mine"},"saved":9}]',
			"cubist-sound-v1": "off",
		},
	);
});

test("sound is muted only by the exact word off", () =>
{
	const data = stub({});
	expect(storage.readMuted()).toBe(false);
	storage.writeMuted(false);
	expect([data.get("cubist-sound-v1"), storage.readMuted()]).toStrictEqual(["on", false]);
	storage.writeMuted(true);
	expect([data.get("cubist-sound-v1"), storage.readMuted()]).toStrictEqual(["off", true]);
});

test("clearing the tips removes only their key", () =>
{
	const data = stub(
		{
			"cubist-tips-seen-v1": "{}",
			"cubist-progress-v2": "{}",
		},
	);
	storage.clearTipsSeen();
	expect([...data.keys()]).toStrictEqual(["cubist-progress-v2"]);
});

test("blocked storage reports failed writes and never throws", () =>
{
	blocked();
	expect([storage.writeProgress({}), storage.setMine([]), storage.readMuted()]).toStrictEqual([false, false, false]);
	expect(() =>
	{
		storage.clearTipsSeen();
		storage.writeMuted(true);
	}).not.toThrow();
});
