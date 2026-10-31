import {readFileSync} from "node:fs";
import {expect, type Page, test} from "@playwright/test";
import {topLevelNames} from "../../scripts/original-global-scope.ts";
import {atLevel, BASE_URL, DIST_PATH, LEGACY_PATH, type Pair, withPair} from "./harness/pair.ts";

const legacyHtml = readFileSync(new URL("../../legacy/original.html", import.meta.url), "utf8");
const legacyScript = /(?<=<script>\n)[\s\S]*(?=<\/script>)/.exec(legacyHtml)?.[0] ?? "";
const NAMES = [...topLevelNames(legacyScript).keys()];

// A value as devtools would show it: element identity, function name, plain data otherwise. ovRaf holds a
// browser frame handle, whose number depends on how many frames the harness itself has waited for.
const DESCRIBE = `(() => {
	const describe = (value, depth) => {
		if (typeof value === "function") return "function " + value.name;
		if (value === null || typeof value !== "object") return typeof value === "number" && !Number.isFinite(value) ? String(value) : value === undefined ? "undefined" : value;
		if (value instanceof Element) return "element " + value.tagName + "#" + value.id + "." + value.className;
		if (value instanceof CSSStyleDeclaration) return "computed style";
		if (depth === 0) return "deep";
		if (Array.isArray(value)) return value.map((item) => describe(item, depth - 1));
		return Object.fromEntries(Object.keys(value).map((key) => [key, describe(value[key], depth - 1)]));
	};
	const read = {};
	${NAMES.filter((name) => name !== "ovRaf")
		.map(
			(name) =>
				`try { read[${JSON.stringify(name)}] = describe(${name}, 6); } catch (e) { read[${JSON.stringify(name)}] = e.name; }`,
		)
		.join("\n")}
	return read;
})()`;

const lexicalNames = async (page: Page): Promise<string[]> => {
	const session = await page.context().newCDPSession(page);
	const {names} = (await session.send("Runtime.globalLexicalScopeNames" as never)) as unknown as {names: string[]};
	return names.toSorted();
};

// The instruments add a __harness property on window, on both sides.
const WINDOW_SURFACE = `Object.getOwnPropertyNames(window).map((name) => {
	const {writable, enumerable, configurable, value} = Object.getOwnPropertyDescriptor(window, name);
	return [name, writable, enumerable, configurable, typeof value];
})`;

const expectSameScope = async (pair: Pair, name: string): Promise<void> => {
	const [legacyWindow, distWindow] = await Promise.all(pair.pages.map(async (page) => page.evaluate(WINDOW_SURFACE)));
	expect(distWindow, `${name}: window`).toStrictEqual(legacyWindow);
	const [legacyLexical, distLexical] = await Promise.all(pair.pages.map(lexicalNames));
	expect(distLexical, `${name}: global lexical names`).toStrictEqual(legacyLexical);
	const [legacyValues, distValues] = await Promise.all(pair.pages.map(async (page) => page.evaluate(DESCRIBE)));
	expect(distValues, `${name}: values`).toStrictEqual(legacyValues);
};

test("the page's global scope is the original's, on window and as lexical names, through a session", async ({
	browser,
}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await expectSameScope(pair, "at load");
		await pair.click("#titlePlay");
		await pair.press("ArrowRight");
		await expectSameScope(pair, "in play");
		await pair.click("#modeEdit");
		await expectSameScope(pair, "in the editor");
	});
});

test("the scope's probes see what the reports saw: LEVELS and S are lexical and mine is on window", async ({page}) => {
	for (const path of [LEGACY_PATH, DIST_PATH]) {
		await page.goto(BASE_URL + path);
		const seen = await page.evaluate(
			`[typeof window.LEVELS, typeof window.S, typeof window.mine, typeof window.saveDraft, typeof window.write, typeof LEVELS, typeof S]`,
		);
		expect(seen).toStrictEqual(["undefined", "undefined", "function", "function", "undefined", "object", "object"]);
	}
});

test("uncaught errors read the same when a saved run is malformed", async ({browser}) => {
	const storage = {...atLevel(1), "cublitz-infinite-run-v1": '{"seed":1,"n":2.5,"effs":"abc","score":0}'};
	await withPair(browser, {storage}, async (pair) => {
		await pair.click("#titleInf");
		const skipped = await pair.step("skip throws", async (page) =>
			page.evaluate(() => document.getElementById("infSkip")?.click()),
		);
		expect(skipped.errors).toStrictEqual([
			"error: Uncaught TypeError: last.reduce is not a function",
			"error: Uncaught TypeError: run.effs.push is not a function",
		]);
	});
});

const HOT_SHAPES: [string, () => void, string[]][] = [
	[
		"ready is not a function",
		() => {
			window.claude = {hot: {ready: 1}} as never;
		},
		["error: Uncaught TypeError: window.claude.hot.ready is not a function"],
	],
	[
		"snapshot is not a function",
		() => {
			window.claude = {hot: {snapshot: 1}} as never;
		},
		["error: Uncaught TypeError: window.claude?.hot?.snapshot is not a function"],
	],
	[
		"reading window.claude throws",
		() => {
			Object.defineProperty(window, "claude", {
				get() {
					throw new RangeError("no hooks here");
				},
			});
		},
		["error: Uncaught RangeError: no hooks here"],
	],
	[
		"the hooks vanish after two reads",
		() => {
			let reads = 0;
			window.claude = {
				get hot() {
					return ++reads <= 2 ? {ready: () => {}} : null;
				},
			} as never;
		},
		["error: Uncaught TypeError: Cannot read properties of null (reading 'ready')"],
	],
];

for (const [name, setup, errors] of HOT_SHAPES) {
	test(`window.claude.hot misbehaving: ${name}`, async ({browser}) => {
		await withPair(browser, {storage: atLevel(2), setup}, async (pair) => {
			expect(pair.last.errors).toStrictEqual(errors);
			await expectSameScope(pair, "after the boot error");
		});
	});
}

test("window.claude.hot is read as many times as the original reads it", async ({browser}) => {
	const setup = (): void => {
		const counts = {hot: 0};
		(window as unknown as {__counts: unknown}).__counts = counts;
		window.claude = {
			get hot() {
				counts.hot++;
				return {};
			},
		};
	};
	await withPair(browser, {setup}, async (pair) => {
		const [legacy, dist] = await Promise.all(
			pair.pages.map(async (page) => page.evaluate(() => (window as unknown as {__counts: unknown}).__counts)),
		);
		expect(dist).toStrictEqual(legacy);
	});
});
