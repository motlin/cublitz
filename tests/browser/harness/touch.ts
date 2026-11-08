import type {Browser, BrowserContext, CDPSession, Page} from "@playwright/test";
import {encodeLevel} from "../../../src/core/share.ts";
import {atLevel, BASE_URL} from "./page.ts";

// Real touch input: Input.dispatchTouchEvent goes through the browser's own gesture handling, so a drag that the page
// leaves to the browser really scrolls, and a pinch really zooms. Synthetic TouchEvents could not show either.
const SIZES: [number, number][] = [
	[320, 568],
	[360, 640],
	[390, 844],
];
export type Screen =
{
	name: string;
	width: number;
	height: number;
};
export const SCREENS: Screen[] = SIZES.flatMap(([width, height]) => [
	{
		name: `${width}x${height} portrait`,
		width,
		height,
	},
	{
		name: `${width}x${height} landscape`,
		width: height,
		height: width,
	},
]);

export type Point = [x: number, y: number];
export type Finger =
{
	id: number;
	x: number;
	y: number;
};

export const sleep = async (ms: number): Promise<void> =>
{
	await new Promise((resolve) =>
	{
		setTimeout(resolve, ms);
	});
};

const ALL_LEVELS = 31;

export async function openPhone(
	browser: Browser,
	screen: Screen,
	storage: Record<string, string> = atLevel(ALL_LEVELS),
	path = "/",
): Promise<
{
	context: BrowserContext;
	page: Page;
	cdp: CDPSession;
}>
{
	const context = await browser.newContext(
		{
			viewport:
			{
				width: screen.width,
				height: screen.height,
			},
			screen:
			{
				width: screen.width,
				height: screen.height,
			},
			hasTouch: true,
			isMobile: true,
			deviceScaleFactor: 2,
			storageState:
			{
				cookies: [],
				origins: [
					{
						origin: BASE_URL,
						localStorage: Object.entries(storage).map(([name, value]) => (
						{
							name,
							value,
						})),
					},
				],
			},
		},
	);
	await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => route.abort());
	const page = await context.newPage();
	// A passing test never waits this long; only a machine loaded by many parallel workers does.
	page.setDefaultTimeout(15_000);
	await page.goto(
		BASE_URL + path,
		{
			waitUntil: "load",
		},
	);
	await sleep(150);
	return {
		context,
		page,
		cdp: await context.newCDPSession(page),
	};
}

const send = async (
	cdp: CDPSession,
	type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
	fingers: Finger[],
): Promise<void> =>
{
	await cdp.send(
		"Input.dispatchTouchEvent",
		{
			type,
			touchPoints: fingers.map(({id, x, y}) => (
			{
				id,
				x,
				y,
			})),
		},
	);
};

/** Lifting at speed makes Linux Chromium drop the click of the next tap, even 1.5s later. Holding still first keeps it. */
export const holdBeforeLift = async (): Promise<void> => sleep(150);

/** One finger drags from a point to another, then lifts. */
export async function drag(cdp: CDPSession, from: Point, to: Point, steps = 10): Promise<void>
{
	await send(cdp, "touchStart", [
		{
			id: 1,
			x: from[0],
			y: from[1],
		},
	]);
	for (let i = 1; i <= steps; i++)
	{
		await sleep(12);
		const t = i / steps;
		await send(cdp, "touchMove", [
			{
				id: 1,
				x: from[0] + (to[0] - from[0]) * t,
				y: from[1] + (to[1] - from[1]) * t,
			},
		]);
	}
	await sleep(12);
	await send(cdp, "touchEnd", []);
	await sleep(40);
}

/** Moves any number of fingers along straight lines, starting them together and lifting them one by one. */
export async function gesture(cdp: CDPSession, paths: [Point, Point][], lift: number[] = [], steps = 10): Promise<void>
{
	const at = (t: number): Finger[] =>
		paths.map(([from, to], i) => (
		{
			id: i + 1,
			x: from[0] + (to[0] - from[0]) * t,
			y: from[1] + (to[1] - from[1]) * t,
		}));
	await send(cdp, "touchStart", at(0).slice(0, 1));
	await sleep(12);
	await send(cdp, "touchStart", at(0));
	for (let i = 1; i <= steps; i++)
	{
		await sleep(12);
		await send(cdp, "touchMove", at(i / steps));
	}
	await holdBeforeLift();
	let live = at(1);
	for (const id of lift.length ? lift : live.map((finger) => finger.id))
	{
		await sleep(12);
		live = live.filter((finger) => finger.id !== id);
		await send(cdp, "touchEnd", live);
	}
	await sleep(40);
}

/** The fingers as a script: each step is the full list of fingers then down, in order, or a wait in milliseconds. Lets
 * a thumb land mid-swipe. */
export async function fingerScript(cdp: CDPSession, frames: (Finger[] | number)[]): Promise<void>
{
	let down: Finger[] = [];
	for (const frame of frames)
	{
		if (typeof frame === "number")
		{
			await sleep(frame);
			continue;
		}
		const landed = frame.some(({id}) => !down.some((finger) => finger.id === id));
		const lifted = down.some(({id}) => !frame.some((finger) => finger.id === id));
		await send(cdp, landed ? "touchStart" : lifted ? "touchEnd" : "touchMove", frame);
		down = frame;
		await sleep(12);
	}
	await sleep(40);
}

export const liftAll = async (cdp: CDPSession): Promise<void> =>
{
	await send(cdp, "touchEnd", []);
	await sleep(40);
};

/** An open floor with the cube in the middle, so every direction can roll. */
export const OPEN_FLOOR = `/?${encodeLevel(
	{
		name: "Open floor",
		map: [".......", ".......", ".......", "...S...", ".......", ".......", "......X"],
	},
)}`;

export const cubeAt = async (
	page: Page,
): Promise<
{
	x: number;
	y: number;
	moves: number;
}> => page.evaluate("({x: S.st.x, y: S.st.y, moves: S.hist.length})");

export const settle = async (page: Page): Promise<void> =>
{
	await page.waitForFunction("!S.busy");
};

/** Which way the cube moved in the last roll, undoing it so the next swipe starts from the same place. */
export async function rolled(page: Page): Promise<string>
{
	await settle(page);
	const {x, y, moves} = await cubeAt(page);
	if (!moves) return "none";
	await page.evaluate("undo()");
	const before = await cubeAt(page);
	const dx = x - before.x,
		dy = y - before.y;
	return dx > 0 ? "E" : dx < 0 ? "W" : dy > 0 ? "S" : dy < 0 ? "N" : "still";
}

export const viewportCentre = async (page: Page): Promise<Point> =>
	page.evaluate(() =>
	{
		const r = document.querySelector("#viewport")!.getBoundingClientRect();
		return [r.left + r.width / 2, r.top + r.height / 2] as [number, number];
	});

/** The on-screen angle of each roll, measured from the centres of real tiles. */
export const measuredAxes = async (page: Page): Promise<Record<string, number>> =>
	page.evaluate(() =>
	{
		const centre = (x: number, y: number): [number, number] =>
		{
			const tile = [...document.querySelectorAll<HTMLElement>("#board .tile")].find(
				(t) =>
					t.style.left === `${x * parseFloat(t.style.width || getComputedStyle(t).width)}px` &&
					t.style.top === `${y * parseFloat(getComputedStyle(t).height)}px`,
			)!;
			const r = tile.getBoundingClientRect();
			return [r.left + r.width / 2, r.top + r.height / 2];
		};
		const [cx, cy] = centre(3, 3);
		const axis = (x: number, y: number): number =>
		{
			const [px, py] = centre(x, y);
			return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
		};
		return {
			E: axis(4, 3),
			S: axis(3, 4),
			W: axis(2, 3),
			N: axis(3, 2),
		};
	});

/** The elements of a list that do not sit wholly on screen and on top, so a finger can really reach them. */
export const unreachable = async (page: Page, selectors: string[]): Promise<string[]> =>
	page.evaluate((list) =>
	{
		const out: string[] = [];
		for (const selector of list)
			for (const el of document.querySelectorAll(selector))
			{
				const r = el.getBoundingClientRect();
				if (r.width === 0 || r.height === 0)
				{
					out.push(`${selector}: not rendered`);
					continue;
				}
				if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)
				{
					out.push(`${selector}: off screen`);
					continue;
				}
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				if (!hit || !(el === hit || el.contains(hit))) out.push(`${selector}: covered`);
			}
		return out;
	}, selectors);

/** Tiles and cube parts that the board's area or the screen cuts off. */
export const clippedTiles = async (page: Page): Promise<number> =>
	page.evaluate(() =>
	{
		const v = document.querySelector("#viewport")!.getBoundingClientRect();
		return [...document.querySelectorAll("#board .tile")].filter((tile) =>
		{
			const r = tile.getBoundingClientRect();
			return (
				r.left < Math.max(0, v.left) - 0.5 ||
				r.top < Math.max(0, v.top) - 0.5 ||
				r.right > Math.min(innerWidth, v.right) + 0.5 ||
				r.bottom > Math.min(innerHeight, v.bottom) + 0.5
			);
		}).length;
	});

export const boardBox = async (
	page: Page,
): Promise<
{
	x: number;
	y: number;
	width: number;
	height: number;
}> =>
	page.evaluate(() =>
	{
		const r = document.querySelector("#board")!.getBoundingClientRect();
		return {
			x: r.x,
			y: r.y,
			width: r.width,
			height: r.height,
		};
	});

/** Fingers landing in one event, moving together in the given steps, then lifting. */
export async function together(cdp: CDPSession, paths: [Point, Point][], steps = 10, gap = 12): Promise<void>
{
	const at = (t: number): Finger[] =>
		paths.map(([from, to], i) => (
		{
			id: i + 1,
			x: from[0] + (to[0] - from[0]) * t,
			y: from[1] + (to[1] - from[1]) * t,
		}));
	await send(cdp, "touchStart", at(0));
	for (let i = 1; i <= steps; i++)
	{
		await sleep(gap);
		await send(cdp, "touchMove", at(i / steps));
	}
	await holdBeforeLift();
	await send(cdp, "touchEnd", []);
	await sleep(60);
}

/** The board's zoom and its pan offset, read from the transform the camera writes. */
export const cameraOf = async (
	page: Page,
): Promise<
{
	zoom: number;
	x: number;
}> =>
	page.evaluate(() =>
	{
		const transform = document.querySelector<HTMLElement>("#board")!.style.transform;
		return {
			zoom: Number(/scale3d\(([\d.]+)/.exec(transform)?.[1] ?? 1),
			x: Number(/translate\((-?[\d.]+)px/.exec(transform)?.[1] ?? 0),
		};
	});

export const rectOf = async (
	page: Page,
	selector: string,
): Promise<
{
	x: number;
	y: number;
	right: number;
	bottom: number;
}> =>
	page.evaluate((target) =>
	{
		const r = document.querySelector(target)!.getBoundingClientRect();
		return {
			x: r.left,
			y: r.top,
			right: r.right,
			bottom: r.bottom,
		};
	}, selector);

export async function openFromMenu(page: Page, label: string): Promise<void>
{
	await page.locator("#menuBtn").tap();
	await page
		.locator(
			"#levels button",
			{
				hasText: new RegExp(`^${label}$`),
			},
		)
		.tap();
	await sleep(60);
}
