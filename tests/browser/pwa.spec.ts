import {type ChildProcess, spawn} from "node:child_process";
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {type Browser, type BrowserContext, expect, type Page, test} from "@playwright/test";
import {initState} from "../../src/core/level.ts";
import {MERGE_LEVELS} from "../../src/core/merge-levels.ts";
import {solve} from "../../src/core/solver.ts";
import type {Direction} from "../../src/core/types.ts";
import {MANIFEST, PRECACHE_URLS} from "../../src/pwa/manifest.ts";
import {cacheName} from "../../src/pwa/worker.ts";
import {atLevel, BASE_URL, engine} from "./harness/pair.ts";
import {openFromMenu, openPhone, SCREENS, unreachable} from "./harness/touch.ts";

const KEYS: Record<Direction, string> = {N: "ArrowUp", S: "ArrowDown", E: "ArrowRight", W: "ArrowLeft"};
const FLIP =
	"?CUBLITZ:eyJuYW1lIjoiRmxpcCBpdCBhbmQgcmV2ZXJzZSBpdCIsIm1hcCI6WyIuLnJveS4uLllPUlgiLCJTLnJveS4uLllPUlgiLCIuLnJveS4uLllPUlgiXSwiayI6e319";
const version = (): string => /"([0-9a-f]{16})"/.exec(readFileSync("dist/sw.js", "utf8"))?.[1] ?? "";

const openContext = async (browser: Browser, base = BASE_URL, storage = atLevel(0)): Promise<BrowserContext> => {
	const context = await browser.newContext({
		reducedMotion: "reduce",
		serviceWorkers: "allow",
		storageState: {
			cookies: [],
			origins: [{origin: base, localStorage: Object.entries(storage).map(([name, value]) => ({name, value}))}],
		},
	});
	await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => route.abort());
	return context;
};

/** Loads the page and waits until its worker has installed, activated and taken control of it. */
const launch = async (context: BrowserContext, url: string): Promise<Page> => {
	const page = await context.newPage();
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(url);
	await page.evaluate(async () => navigator.serviceWorker.ready.then(() => undefined));
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
	expect(errors).toStrictEqual([]);
	return page;
};

const cacheKeys = async (page: Page): Promise<string[]> => page.evaluate(async () => caches.keys());

const roll = async (page: Page, path: string): Promise<void> => {
	for (const direction of path) {
		await page.keyboard.press(KEYS[direction as Direction]);
		await page.waitForFunction("!S.busy");
	}
};

test("the page links a manifest that Chromium reads without errors and can install", async ({browser}) => {
	const context = await openContext(browser);
	const page = await launch(context, `${BASE_URL}/`);
	const cdp = await context.newCDPSession(page);
	const manifest = (await cdp.send("Page.getAppManifest", {})) as {url: string; errors: unknown[]; data: string};
	expect({url: manifest.url, errors: manifest.errors, data: JSON.parse(manifest.data)}).toStrictEqual({
		url: `${BASE_URL}/manifest.webmanifest`,
		errors: [],
		data: MANIFEST,
	});
	expect(await cdp.send("Page.getInstallabilityErrors")).toStrictEqual({installabilityErrors: []});
	const types = await page.evaluate(async (urls) => {
		const found: Record<string, string> = {};
		for (const url of urls) found[url] = (await fetch(url)).headers.get("content-type") ?? "";
		return found;
	}, PRECACHE_URLS);
	expect(types).toStrictEqual({
		"/": "text/html; charset=utf-8",
		"/manifest.webmanifest": "application/manifest+json",
		"/icons/icon-192.png": "image/png",
		"/icons/icon-512.png": "image/png",
		"/icons/icon-maskable-512.png": "image/png",
		"/icons/apple-touch-icon.png": "image/png",
	});
	expect(
		await page.evaluate(() =>
			[
				...document.head.querySelectorAll(
					"link[rel=manifest], link[rel=apple-touch-icon], meta[name]:not([name=viewport])",
				),
			].map((el) => el.outerHTML),
		),
	).toStrictEqual([
		'<link rel="manifest" href="/manifest.webmanifest">',
		'<meta name="theme-color" content="#161923">',
		'<meta name="mobile-web-app-capable" content="yes">',
		'<meta name="apple-mobile-web-app-capable" content="yes">',
		'<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
		'<meta name="apple-mobile-web-app-title" content="Cublitz">',
		'<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
	]);
	await context.close();
});

test("the worker registers, controls the page and keeps exactly this build's cache", async ({browser}) => {
	const context = await openContext(browser);
	const page = await launch(context, `${BASE_URL}/`);
	expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${BASE_URL}/sw.js`);
	expect(await cacheKeys(page)).toStrictEqual([cacheName(version())]);
	expect(
		await page.evaluate(
			async (name) => (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname),
			cacheName(version()),
		),
	).toStrictEqual(PRECACHE_URLS);
	await context.close();
});

test("offline, a reload still plays the campaign, the merge levels, the editor and a shared link", async ({
	browser,
}) => {
	const context = await openContext(browser);
	const page = await launch(context, `${BASE_URL}/`);
	await context.setOffline(true);
	expect(
		await page.evaluate(async () =>
			fetch("/robots.txt").then(
				() => "online",
				() => "offline",
			),
		),
	).toBe("offline");

	await page.reload();
	await page.locator("#titlePlay").click();
	await expect(page.locator("#lvName")).toHaveText(engine.LEVELS[0]!.name!);
	await roll(page, "EEESSS");
	await expect(page.locator("#win")).toBeVisible();

	await page.reload();
	await page.locator("#titlePlay").click();
	await page.locator('#levels button[title="Stick Together"]').click();
	const merge = MERGE_LEVELS[0]!;
	await expect(page.locator("#lvName")).toHaveText(merge.name!);
	await roll(page, solve(merge, initState(merge))!);
	await expect(page.locator("#win")).toBeVisible();

	await page.reload();
	await page.locator("#titleEdit").click();
	await expect(page.locator("#editView")).toBeVisible();

	await page.goto(`${BASE_URL}/${FLIP}`);
	await expect(page.locator("#lvName")).toHaveText("Flip it and reverse it");
	await expect(page.locator("#lvNum")).toHaveText("Shared level");
	await context.close();
});

test.describe("a new deploy", () => {
	const port = Number(new URL(BASE_URL).port) + 100;
	const base = `http://127.0.0.1:${port}`;
	let site: string;
	let server: ChildProcess;

	test.beforeEach(async () => {
		site = mkdtempSync(join(tmpdir(), "cublitz-deploy-"));
		cpSync("dist", site, {recursive: true});
		server = spawn("node", ["tests/browser/harness/serve.ts"], {
			env: {...process.env, CUBLITZ_DIST_DIR: site, CUBLITZ_PORT: String(port)},
			stdio: ["ignore", "pipe", "inherit"],
		});
		await new Promise<void>((resolve) => {
			server.stdout?.once("data", () => {
				resolve();
			});
		});
	});

	test.afterEach(() => {
		server.kill();
		rmSync(site, {recursive: true, force: true});
	});

	test("shows on the next launch, and its worker replaces the old cache", async ({browser}) => {
		const context = await openContext(browser, base);
		const page = await launch(context, `${base}/`);
		await expect(page).toHaveTitle("Cublitz");
		const old = version();
		const next = "0123456789abcdef";
		expect(await cacheKeys(page)).toStrictEqual([cacheName(old)]);

		const deploy = (file: string, from: string, to: string): void => {
			const text = readFileSync(join(site, file), "utf8");
			expect(text.split(from).length).toBe(2);
			writeFileSync(join(site, file), text.replace(from, to));
		};
		deploy("index.html", "<title>Cublitz</title>", "<title>Cublitz next</title>");
		deploy("sw.js", old, next);

		await page.reload();
		await expect(page).toHaveTitle("Cublitz next");
		await expect.poll(async () => cacheKeys(page)).toStrictEqual([cacheName(next)]);
		await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated");

		await context.setOffline(true);
		await page.reload();
		await expect(page).toHaveTitle("Cublitz next");
		await context.close();
	});
});

// Standalone on a notched phone draws the page under the status bar and the home indicator, so the safe area is all
// the game can use. Chromium's inset override stands in for the notch; it cannot show what iOS itself draws there.
const INSETS = {
	portrait: {top: 47, bottom: 34, left: 0, right: 0},
	landscape: {top: 0, bottom: 21, left: 47, right: 47},
};
const DOCK = ["#dpad button", "#undoBtn", "#resetBtn", "#hintBtn", "#moves", "#par", "#menuBtn"];

for (const screen of SCREENS) {
	test(`${screen.name}: standalone keeps the phone layout inside the safe area`, async ({browser}) => {
		const {context, page, cdp} = await openPhone(browser, screen);
		const insets = screen.width > screen.height ? INSETS.landscape : INSETS.portrait;
		await cdp.send("Emulation.setSafeAreaInsetsOverride", {insets});
		await page.evaluate(() => window.dispatchEvent(new Event("resize")));
		await page.locator("#titlePlay").tap();
		const report: Record<string, unknown> = {};
		for (const label of ["1", "16", "30", "M1"]) {
			await openFromMenu(page, label);
			report[label] = {
				unreachable: await unreachable(page, DOCK),
				unsafe: await page.evaluate(
					({selectors, inset}) => {
						const safe = {
							left: inset.left,
							top: inset.top,
							right: innerWidth - inset.right,
							bottom: innerHeight - inset.bottom,
						};
						return [...document.querySelectorAll(selectors.join(", "))]
							.filter((el) => {
								const r = el.getBoundingClientRect();
								return (
									r.left < safe.left - 0.5 ||
									r.top < safe.top - 0.5 ||
									r.right > safe.right + 0.5 ||
									r.bottom > safe.bottom + 0.5
								);
							})
							.map((el) => el.id || el.className || el.textContent);
					},
					{selectors: [...DOCK, "#board .tile"], inset: insets},
				),
			};
		}
		await page.screenshot({path: test.info().outputPath("standalone.png")});
		const clean = {unreachable: [], unsafe: []};
		expect(report).toStrictEqual({"1": clean, "16": clean, "30": clean, M1: clean});
		await context.close();
	});
}
