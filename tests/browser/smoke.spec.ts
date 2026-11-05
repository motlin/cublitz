import {execFileSync} from "node:child_process";
import {mkdtempSync, readdirSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect, test} from "@playwright/test";
import {BASE_URL, DIST_PATH} from "./harness/page.ts";
import {withSession} from "./harness/session.ts";

test("dist is one page with its CSS and a classic inline script, its app files and its link preview image", async ({
	request,
}) =>
{
	const dist = await (await request.get(BASE_URL + DIST_PATH)).text();
	expect(/<script>\n[\s\S]+<\/script>/.test(dist)).toBe(true);
	expect(/<script[^>]*\bsrc=/.test(dist)).toBe(false);
	expect(dist.includes('<link rel="stylesheet" href="/')).toBe(false);
	const distDir = process.env["CUBLITZ_DIST_DIR"] ?? "dist";
	expect(
		readdirSync(
			distDir,
			{
				recursive: true,
				encoding: "utf8",
			},
		).toSorted((a, b) => a.localeCompare(b)),
	).toStrictEqual([
		"_headers",
		"icons",
		"icons/apple-touch-icon.png",
		"icons/icon-192.png",
		"icons/icon-512.png",
		"icons/icon-maskable-512.png",
		"index.html",
		"manifest.webmanifest",
		"og.png",
		"sw.js",
	]);
});

// The bundle stays a sloppy classic script: a setting read back from localStorage as a number silently ignores
// property writes, which strict mode would turn into a crash.
test("the bundle is a sloppy script", async ({request}) =>
{
	const dist = await (await request.get(BASE_URL + DIST_PATH)).text();
	const script = /(?<=<script>\n)[\s\S]*(?=<\/script>)/.exec(dist)?.[0] ?? "";
	expect(script === "").toBe(false);
	expect(script.includes("use strict")).toBe(false);
});

// Serving a stale dist would make every browser test pass against old code.
test("the page under test is what the current source builds", async ({request}) =>
{
	const scratch = mkdtempSync(join(tmpdir(), "cublitz-fresh-"));
	try
	{
		execFileSync(
			"pnpm",
			["exec", "vp", "build", "--logLevel", "error", "--outDir", scratch, "--emptyOutDir"],
			{
				stdio: "pipe",
			},
		);
		const served = await (await request.get(BASE_URL + DIST_PATH)).text();
		expect(served === readFileSync(join(scratch, "index.html"), "utf8")).toBe(true);
	}
	finally
	{
		rmSync(
			scratch,
			{
				recursive: true,
				force: true,
			},
		);
	}
});

test("the harness pins Math.random and Date the same way in every session", async ({browser}) =>
{
	const sample = () => [Math.random(), Math.random(), Date.now(), new Date().toISOString()];
	const samples: unknown[][] = [];
	for (let i = 0; i < 2; i++)
		await withSession(browser, {}, async (session) =>
		{
			samples.push(await session.page.evaluate(sample));
		});
	const [first, second] = samples;
	expect(second).toStrictEqual(first);
	expect(first?.slice(2)).toStrictEqual([Date.UTC(2026, 0, 2, 3, 4, 5), "2026-01-02T03:04:05.000Z"]);
});
