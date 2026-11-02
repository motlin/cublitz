import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtempSync, readdirSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect, test} from "@playwright/test";
import {readInfiniteGolden, readSolveGolden} from "../support/golden.ts";
import {BASE_URL, DIST_PATH, EXPECTED_PATH, LEGACY_PATH, withPair} from "./harness/pair.ts";

test("the legacy artifact is the source file, byte for byte", async ({request}) => {
	const body = await (await request.get(BASE_URL + LEGACY_PATH)).body();
	expect(createHash("sha256").update(body).digest("hex")).toBe(
		"a52a636cfe3705e3cc10d3bc6fe06f3b6a8b9b60fe3035d38f2e2181fd889fdb",
	);
});

test("dist is one page, the original byte for byte outside the body of its classic inline script, and its app files", async ({
	request,
}) => {
	const scriptBody = /(?<=<script>\n)[\s\S]*(?=<\/script>)/;
	const read = async (path: string): Promise<string> => (await request.get(BASE_URL + path)).text();
	const [legacy, dist] = await Promise.all([read(LEGACY_PATH), read(DIST_PATH)]);
	expect(dist.replace(scriptBody, "")).toBe(legacy.replace(scriptBody, ""));
	expect(scriptBody.test(dist)).toBe(true);
	const distDir = process.env["CUBLITZ_DIST_DIR"] ?? "dist";
	expect(
		readdirSync(distDir, {recursive: true, encoding: "utf8"}).toSorted((a, b) => a.localeCompare(b)),
	).toStrictEqual([
		"_headers",
		"icons",
		"icons/apple-touch-icon.png",
		"icons/icon-192.png",
		"icons/icon-512.png",
		"icons/icon-maskable-512.png",
		"index.html",
		"manifest.webmanifest",
		"sw.js",
	]);
});

// The original is a sloppy classic script and the bundle stays one: a setting read back from localStorage as a
// number silently ignores property writes, which strict mode would turn into a crash.
test("the bundle is a sloppy script", async ({request}) => {
	const dist = await (await request.get(BASE_URL + DIST_PATH)).text();
	const script = /(?<=<script>\n)[\s\S]*(?=<\/script>)/.exec(dist)?.[0] ?? "";
	expect(script === "").toBe(false);
	expect(script.includes("use strict")).toBe(false);
});

// Serving a stale dist, or the original under dist's name, would make every comparison below pass.
test("the page under test is what the current source builds", async ({request}) => {
	const scratch = mkdtempSync(join(tmpdir(), "cublitz-fresh-"));
	try {
		execFileSync("pnpm", ["exec", "vp", "build", "--logLevel", "error", "--outDir", scratch, "--emptyOutDir"], {
			stdio: "pipe",
		});
		const served = await (await request.get(BASE_URL + DIST_PATH)).text();
		expect(served === readFileSync(join(scratch, "index.html"), "utf8")).toBe(true);
	} finally {
		rmSync(scratch, {recursive: true, force: true});
	}
});

// These read the original's own globals in a real browser, so Node's reading of the script and
// Chromium's cannot drift apart (the original infCandidate's random-comparator sort depends on the engine).
test("the goldens match the original script running in the browser", async ({page}) => {
	await page.goto(BASE_URL + LEGACY_PATH);
	// A string, because const and let at the top of a classic script are not properties of window.
	const solved = await page.evaluate("LEVELS.map(level => [solve(level, initState(level)), solve.hitLimit])");
	expect(solved).toStrictEqual(readSolveGolden("solve.json").map((g) => [g.path, g.hitLimit]));

	const infinite = readInfiniteGolden("infinite.json");
	const cases = JSON.stringify(infinite.map((g) => [g.seed, g.n]));
	const generated = await page.evaluate(`(async () => {
		const out = [];
		for (const [seed, n] of ${cases}) {
			run = { seed, n:0 };
			out.push(await new Promise(resolve => genInf(n, lv => resolve(JSON.parse(JSON.stringify(lv))))));
		}
		return out;
	})()`);
	expect(generated).toStrictEqual(infinite.map((g) => g.level));
});

// genInf and run are globals on both sides, so the shipped generator itself runs in the same browser. The
// golden files cover few seeds, and a one-percent change to a probability only shows on some of them.
for (const seed of [1, 4, 9, 77, 2024, 31337]) {
	test(`the shipped generator matches the original deep into a run of seed ${seed}`, async ({page}) => {
		const generate = `(async () => {
			const out = [];
			for (const n of [6, 8, 10, 15, 21, 27, 33]) {
				run = { seed:${seed}, n:0 };
				out.push(await new Promise(resolve => genInf(n, lv => resolve(JSON.parse(JSON.stringify(lv))))));
			}
			return out;
		})()`;
		await page.goto(BASE_URL + EXPECTED_PATH);
		const original = await page.evaluate(generate);
		await page.goto(BASE_URL + DIST_PATH);
		expect(await page.evaluate(generate)).toStrictEqual(original);
	});
}

test("the post-fix goldens match the expected page and dist in the browser", async ({page}) => {
	const solve = readSolveGolden("solve-post-fix.json").map((g) => [g.name, g.path, g.hitLimit]);
	const infinite = readInfiniteGolden("infinite-post-fix.json");
	const generate = `(async () => {
		const out = [];
		for (const [seed, n] of ${JSON.stringify(infinite.map((g) => [g.seed, g.n]))}) {
			run = { seed, n:0 };
			out.push(await new Promise(resolve => genInf(n, lv => resolve(JSON.parse(JSON.stringify(lv))))));
		}
		return out;
	})()`;
	const generated = [];
	for (const path of [EXPECTED_PATH, DIST_PATH]) {
		await page.goto(BASE_URL + path);
		const solved = await page.evaluate(
			"LEVELS.map(level => [level.name, solve(level, initState(level)), solve.hitLimit])",
		);
		generated.push({solved, infinite: await page.evaluate(generate)});
	}
	const expected = {solved: solve, infinite: infinite.map((g) => g.level)};
	expect(generated).toStrictEqual([expected, expected]);
});

test("the screenshot comparison on its own notices a one-element paint change", async ({browser}) => {
	await withPair(browser, {}, async (pair) => {
		await pair.expectSameScreenshot("before");
		await pair.dist.addStyleTag({content: ".title-keys { color: #123456 !important; }"});
		await expect(pair.expectSameScreenshot("after")).rejects.toThrow('screenshot "after" differs');
	});
});

test("the harness pins Math.random and Date identically in both pages", async ({browser}) => {
	await withPair(browser, {}, async (pair) => {
		const sample = () => [Math.random(), Math.random(), Date.now(), new Date().toISOString()];
		const [legacy, dist] = await Promise.all(pair.pages.map(async (page) => page.evaluate(sample)));
		expect(dist).toStrictEqual(legacy);
		expect(legacy?.slice(2)).toStrictEqual([Date.UTC(2026, 0, 2, 3, 4, 5), "2026-01-02T03:04:05.000Z"]);
	});
});
