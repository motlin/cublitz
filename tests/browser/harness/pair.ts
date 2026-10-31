import {writeFileSync} from "node:fs";
import {type Browser, type BrowserContext, expect, type Page, test} from "@playwright/test";
import {loadOriginalEngine} from "../../support/original-engine.ts";
import {keyFor} from "../../support/paths.ts";
import {installInstruments, type InstrumentOptions, type Snapshot} from "./instruments.ts";

export const BASE_URL = `http://127.0.0.1:${process.env["CUBLITZ_PORT"] ?? "4817"}`;
export const LEGACY_PATH = "/legacy/original.html";
export const DIST_PATH = "/";
export const DESKTOP = {width: 1280, height: 800};
export const MOBILE = {width: 390, height: 844};
export const engine = loadOriginalEngine();
export const LEVEL_NAMES = engine.LEVELS.map((level) => level.name ?? "");

export const PINNED_NOW = Date.UTC(2026, 0, 2, 3, 4, 5);

export type PairOptions = {
	viewport?: {width: number; height: number};
	reducedMotion?: boolean;
	mobile?: boolean;
	storage?: Record<string, string>;
	hot?: InstrumentOptions["hot"];
};

/** localStorage that opens level `index` from the title's Play button, with the tutorial already seen. */
export function atLevel(index: number, tipsSeen = true): Record<string, string> {
	const beaten = Object.fromEntries(LEVEL_NAMES.slice(0, index).map((name) => [name, 99]));
	const tips = Object.fromEntries(
		["roll", "paint", "gate", "need", "switch", "button", "wgate", "wash", "white"].map((key) => [key, true]),
	);
	return {
		"cubist-progress-v2": JSON.stringify(beaten),
		...(tipsSeen ? {"cubist-tips-seen-v1": JSON.stringify(tips)} : {}),
	};
}

// Mobile emulation lays the page out again just after load, and the game re-renders on resize.
// instruments.ts holds back the browser's own events, so this one is delivered on purpose.
async function afterLoad(page: Page, mobile: boolean): Promise<void> {
	await page.waitForTimeout(mobile ? 300 : 50);
	if (mobile) await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

type Side = {label: string; context: BrowserContext; page: Page; externalRequests: string[]};
type Action = (page: Page) => Promise<unknown>;

/** The same scripted session against legacy/original.html and dist/, compared after every step. */
export class Pair {
	last!: Snapshot;
	steps = 0;
	private readonly sides: Side[];
	private readonly mobile: boolean;

	private constructor(sides: Side[], mobile: boolean) {
		this.sides = sides;
		this.mobile = mobile;
	}

	static async open(browser: Browser, options: PairOptions = {}): Promise<Pair> {
		const instruments: InstrumentOptions = {randomSeed: 20260102, now: PINNED_NOW, hot: options.hot ?? null};
		const openSide = async (label: string, path: string): Promise<Side> => {
			const context = await browser.newContext({
				viewport: options.viewport ?? DESKTOP,
				reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
				hasTouch: options.mobile ?? false,
				isMobile: options.mobile ?? false,
				permissions: ["clipboard-read", "clipboard-write"],
				storageState: {
					cookies: [],
					origins: [
						{
							origin: BASE_URL,
							localStorage: Object.entries(options.storage ?? {}).map(([name, value]) => ({name, value})),
						},
					],
				},
			});
			const externalRequests: string[] = [];
			await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
				const url = route.request().url();
				externalRequests.push(url);
				if (url.includes("fonts.googleapis.com")) await route.fulfill({contentType: "text/css", body: ""});
				else await route.abort();
			});
			await context.addInitScript(installInstruments, instruments);
			const page = await context.newPage();
			await page.goto(BASE_URL + path, {waitUntil: "load"});
			await afterLoad(page, options.mobile ?? false);
			return {label, context, page, externalRequests};
		};
		const sides = await Promise.all([openSide("legacy", LEGACY_PATH), openSide("dist", DIST_PATH)]);
		const pair = new Pair(sides, options.mobile ?? false);
		await pair.compare("page load");
		return pair;
	}

	get legacy(): Page {
		return (this.sides[0] as Side).page;
	}

	get dist(): Page {
		return (this.sides[1] as Side).page;
	}

	get pages(): Page[] {
		return this.sides.map((side) => side.page);
	}

	/** Runs an action on both pages, lets each settle, then compares everything the harness can see. */
	async step(name: string, action: Action): Promise<Snapshot> {
		await Promise.all(this.pages.map((page) => action(page)));
		return this.compare(name);
	}

	click(selector: string, name = `click ${selector}`): Promise<Snapshot> {
		return this.step(name, (page) => page.locator(selector).click());
	}

	press(key: string, name = `press ${key}`): Promise<Snapshot> {
		return this.step(name, (page) => page.keyboard.press(key));
	}

	/** Rolls one key per direction, comparing after every roll. */
	async roll(path: string, keys: (direction: string, index: number) => string = keyFor): Promise<Snapshot> {
		let index = 0;
		for (const direction of path) {
			await this.press(keys(direction, index), `roll ${index + 1}/${path.length} ${direction}`);
			index++;
		}
		return this.last;
	}

	/** Dismisses tutorial pop-ups one at a time until none remain, returning each title. */
	async dismissTips(): Promise<string[]> {
		const titles: string[] = [];
		while (!this.last.tip.hidden) {
			titles.push(this.last.tip.title);
			await this.press("Enter", `dismiss tip ${this.last.tip.title}`);
		}
		return titles;
	}

	fireParkedTimers(): Promise<Snapshot> {
		return this.step("fire parked long timers", (page) => page.evaluate(() => window.__harness.fireParked()));
	}

	tickIntervals(count: number): Promise<Snapshot> {
		return this.step(`tick intervals x${count}`, (page) => page.evaluate((n) => window.__harness.tickIntervals(n), count));
	}

	/** Changes the viewport and delivers the resize event the game listens for. */
	resize(width: number, height: number): Promise<Snapshot> {
		return this.step(`resize to ${width}x${height}`, async (page) => {
			await page.setViewportSize({width, height});
			await page.evaluate(() => window.dispatchEvent(new Event("resize")));
		});
	}

	/** Screenshots both pages with animations settled; a retake rules out raster timing noise. */
	async expectSameScreenshot(name: string): Promise<void> {
		const shoot = () => Promise.all(this.pages.map((page) => page.screenshot({animations: "disabled", fullPage: true})));
		let [legacy, dist] = (await shoot()) as [Buffer, Buffer];
		for (let retake = 0; retake < 3 && !dist.equals(legacy); retake++) {
			[legacy, dist] = (await shoot()) as [Buffer, Buffer];
		}
		if (!dist.equals(legacy)) {
			writeFileSync(test.info().outputPath(`${name} legacy.png`), legacy);
			writeFileSync(test.info().outputPath(`${name} dist.png`), dist);
		}
		expect(dist.equals(legacy), `screenshot "${name}" differs`).toBe(true);
	}

	reload(): Promise<Snapshot> {
		return this.step("reload", async (page) => {
			await page.reload({waitUntil: "load"});
			await afterLoad(page, this.mobile);
		});
	}

	/** Compares the outside-world requests each page made and closes both. */
	async close(): Promise<void> {
		const [legacy, dist] = this.sides as [Side, Side];
		expect(dist.externalRequests, "external requests").toStrictEqual(legacy.externalRequests);
		await Promise.all(this.sides.map((side) => side.context.close()));
	}

	private async compare(name: string): Promise<Snapshot> {
		this.steps++;
		const [legacy, dist] = (await Promise.all(
			this.pages.map(async (page) => {
				await page.evaluate(() => window.__harness.settled());
				return page.evaluate(() => window.__harness.capture());
			}),
		)) as [Snapshot, Snapshot];
		if (JSON.stringify(legacy) !== JSON.stringify(dist)) {
			const changed = Object.keys(legacy.hashes).filter((key) => legacy.hashes[key] !== dist.hashes[key]);
			if (changed.length > 0) {
				const [fullLegacy, fullDist] = await Promise.all(this.pages.map((page) => page.evaluate(() => window.__harness.full())));
				for (const key of changed) {
					expect((fullDist as Record<string, unknown>)[key], `step "${name}" section ${key}`).toStrictEqual(
						(fullLegacy as Record<string, unknown>)[key],
					);
				}
			}
			expect(dist, `step "${name}"`).toStrictEqual(legacy);
		}
		this.last = legacy;
		return legacy;
	}
}

export async function withPair(browser: Browser, options: PairOptions, script: (pair: Pair) => Promise<void>): Promise<void> {
	const pair = await Pair.open(browser, options);
	await script(pair);
	await pair.close();
}
