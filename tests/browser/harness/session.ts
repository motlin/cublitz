import {type Browser, type BrowserContext, expect, type Page} from "@playwright/test";
import {keyFor} from "../../support/paths.ts";
import {installInstruments, type InstrumentOptions, type Snapshot} from "./instruments.ts";
import {BASE_URL, DESKTOP, DIST_PATH, PINNED_NOW} from "./page.ts";

export type SessionOptions =
{
	viewport?:
	{
		width: number;
		height: number;
	};
	reducedMotion?: boolean;
	mobile?: boolean;
	storage?: Record<string, string>;
	hot?: InstrumentOptions["hot"];
	/** Runs in the page after the instruments and before the game, to change what the browser offers. */
	setup?: () => void;
};

// Mobile emulation lays the page out again just after load, and the game re-renders on resize.
// instruments.ts holds back the browser's own events, so this one is delivered on purpose.
async function afterLoad(page: Page, mobile: boolean): Promise<void>
{
	await page.waitForTimeout(mobile ? 300 : 50);
	if (mobile) await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

type Action = (page: Page) => Promise<unknown>;

/** Touch emulation without the phone layout, which tests/browser/touch.spec.ts covers on its own. */
const withoutPhoneLayout = (): void =>
{
	const real = window.matchMedia.bind(window);
	window.matchMedia = (query: string): MediaQueryList =>
	{
		if (!query.includes("pointer: coarse")) return real(query);
		return {
			matches: false,
			media: query,
			addEventListener()
			{
			},
			removeEventListener()
			{
			},
		} as unknown as MediaQueryList;
	};
};

/** A scripted session against dist/ with Math.random, Date and timers pinned, capturing a snapshot after every step. */
export class Session
{
	last!: Snapshot;
	steps = 0;
	readonly page: Page;
	private readonly context: BrowserContext;
	private readonly externalRequests: string[];
	private readonly mobile: boolean;

	private constructor(context: BrowserContext, page: Page, externalRequests: string[], mobile: boolean)
	{
		this.context = context;
		this.page = page;
		this.externalRequests = externalRequests;
		this.mobile = mobile;
	}

	static async open(browser: Browser, options: SessionOptions = {}): Promise<Session>
	{
		const instruments: InstrumentOptions =
		{
			randomSeed: 20260102,
			now: PINNED_NOW,
			hot: options.hot ?? null,
		};
		const context = await browser.newContext(
			{
				viewport: options.viewport ?? DESKTOP,
				reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
				hasTouch: options.mobile ?? false,
				isMobile: options.mobile ?? false,
				permissions: ["clipboard-read", "clipboard-write"],
				storageState:
				{
					cookies: [],
					origins: [
						{
							origin: BASE_URL,
							localStorage: Object.entries(options.storage ?? {}).map(([name, value]) => (
							{
								name,
								value,
							})),
						},
					],
				},
			},
		);
		const externalRequests: string[] = [];
		await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) =>
		{
			const url = route.request().url();
			externalRequests.push(url);
			if (url.includes("fonts.googleapis.com"))
				await route.fulfill(
					{
						contentType: "text/css",
						body: "",
					},
				);
			else await route.abort();
		});
		await context.addInitScript(installInstruments, instruments);
		if (options.mobile) await context.addInitScript(withoutPhoneLayout);
		if (options.setup) await context.addInitScript(options.setup);
		const page = await context.newPage();
		await page.goto(
			BASE_URL + DIST_PATH,
			{
				waitUntil: "load",
			},
		);
		await afterLoad(page, options.mobile ?? false);
		const session = new Session(context, page, externalRequests, options.mobile ?? false);
		await session.capture();
		return session;
	}

	/** Runs an action on the page, lets it settle, then captures everything the harness can see. */
	async step(_name: string, action: Action): Promise<Snapshot>
	{
		await action(this.page);
		return this.capture();
	}

	async click(selector: string, name = `click ${selector}`): Promise<Snapshot>
	{
		return this.step(name, async (page) => page.locator(selector).click());
	}

	async press(key: string, name = `press ${key}`): Promise<Snapshot>
	{
		return this.step(name, async (page) => page.keyboard.press(key));
	}

	/** Rolls one key per direction, capturing after every roll. */
	async roll(path: string, keys: (direction: string, index: number) => string = keyFor): Promise<Snapshot>
	{
		let index = 0;
		for (const direction of path)
		{
			await this.press(keys(direction, index), `roll ${index + 1}/${path.length} ${direction}`);
			index++;
		}
		return this.last;
	}

	/** Dismisses tutorial pop-ups one at a time until none remain, returning each title. */
	async dismissTips(): Promise<string[]>
	{
		const titles: string[] = [];
		while (!this.last.tip.hidden)
		{
			titles.push(this.last.tip.title);
			await this.press("Enter", `dismiss tip ${this.last.tip.title}`);
		}
		return titles;
	}

	async fireParkedTimers(): Promise<Snapshot>
	{
		return this.step("fire parked long timers", async (page) =>
			page.evaluate(() =>
			{
				window.__harness.fireParked();
			}),
		);
	}

	async tickIntervals(count: number): Promise<Snapshot>
	{
		return this.step(`tick intervals x${count}`, async (page) =>
			page.evaluate((n) =>
			{
				window.__harness.tickIntervals(n);
			}, count),
		);
	}

	/** Changes the viewport and delivers the resize event the game listens for. */
	async resize(width: number, height: number): Promise<Snapshot>
	{
		return this.step(`resize to ${width}x${height}`, async (page) =>
		{
			await page.setViewportSize(
				{
					width,
					height,
				},
			);
			await page.evaluate(() => window.dispatchEvent(new Event("resize")));
		});
	}

	async reload(): Promise<Snapshot>
	{
		return this.step("reload", async (page) =>
		{
			await page.reload(
				{
					waitUntil: "load",
				},
			);
			await afterLoad(page, this.mobile);
		});
	}

	/** Checks the page reached outside only for its font stylesheet, then closes it. */
	async close(): Promise<void>
	{
		expect(
			this.externalRequests.filter((url) => !url.startsWith("https://fonts.googleapis.com/")),
			"external requests",
		).toStrictEqual([]);
		await this.context.close();
	}

	private async capture(): Promise<Snapshot>
	{
		this.steps++;
		await this.page.evaluate(async () => window.__harness.settled());
		this.last = await this.page.evaluate(() => window.__harness.capture());
		return this.last;
	}
}

export async function withSession(
	browser: Browser,
	options: SessionOptions,
	script: (session: Session) => Promise<void> | void,
): Promise<void>
{
	const session = await Session.open(browser, options);
	await script(session);
	await session.close();
}
