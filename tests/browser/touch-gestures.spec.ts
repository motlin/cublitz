import {type CDPSession, expect, type Page, test} from "@playwright/test";
import {atLevel, BASE_URL} from "./harness/pair.ts";
import
{
	cameraOf,
	clippedTiles,
	cubeAt,
	fingerScript,
	measuredAxes,
	OPEN_FLOOR,
	openFromMenu,
	openPhone,
	type Point,
	rectOf,
	rolled,
	SCREENS,
	type Screen,
	settle,
	sleep,
	together,
	unreachable,
	viewportCentre,
} from "./harness/touch.ts";

const REST = 250;

const openLevel16 = async (browser: Parameters<typeof openPhone>[0], screen: Screen) =>
{
	const opened = await openPhone(browser, screen);
	await opened.page.locator("#titlePlay").tap();
	await openFromMenu(opened.page, "16");
	return opened;
};

const refit = async (page: Page): Promise<void> =>
{
	if (await page.locator("#fitBtn").isVisible()) await page.locator("#fitBtn").tap();
	await sleep(40);
};

const openEditor = async (browser: Parameters<typeof openPhone>[0], screen: Screen) =>
{
	const opened = await openPhone(browser, screen);
	await opened.page.locator("#titleEdit").tap();
	await sleep(60);
	await opened.page.locator('#edTools [data-tool="erase"]').tap();
	await opened.page.evaluate(() =>
	{
		const main = document.querySelector(".ed-main")!;
		scrollTo(0, main.getBoundingClientRect().top + scrollY);
	});
	await sleep(60);
	return opened;
};

const gridState = async (page: Page) =>
	page.evaluate(() => (
	{
		code: document.querySelector<HTMLTextAreaElement>("#edCode")!.value,
		cell: getComputedStyle(document.querySelector("#edGrid")!).getPropertyValue("--ec"),
	}));

const pageScale = async (page: Page): Promise<number> => page.evaluate(() => visualViewport!.scale);

/** Two fingers land together on two elements and spread apart, as a thumb and finger on the controls would. */
const spreadOn = async (page: Page, cdp: CDPSession, first: string, second: string): Promise<void> =>
{
	const a = await rectOf(page, first);
	const b = await rectOf(page, second);
	const from: [Point, Point] = [
		[a.x + 15, a.y + 20],
		[b.x + 15, b.y + 20],
	];
	await together(cdp, [
		[from[0], [from[0][0] - 30, from[0][1]]],
		[from[1], [from[1][0] + 30, from[1][1]]],
	]);
	await sleep(250);
};

const spreadAcross = async (cdp: CDPSession, x: number, y: number): Promise<void> =>
{
	await together(cdp, [
		[
			[x - 30, y],
			[x - 90, y],
		],
		[
			[x + 30, y],
			[x + 90, y],
		],
	]);
	await sleep(250);
};

// Pairs of the header's words whose text overlaps, naming only what is on screen. A stat's value and label sit tight
// by design, so their line boxes touching does not count.
const headerOverlaps = async (page: Page): Promise<string[]> =>
	page.evaluate(() =>
	{
		const words = [
			"#lvName",
			"#backEdit",
			"#lvNum",
			"#playView aside .stat .v",
			"#playView aside .stat .k",
		].flatMap((selector) =>
			[...document.querySelectorAll(selector)].flatMap((el) =>
			{
				const range = document.createRange();
				range.selectNodeContents(el);
				const box = el.matches("button") ? el.getBoundingClientRect() : range.getBoundingClientRect();
				return box.width
					? [
							{
								el,
								box,
							},
						]
					: [];
			}),
		);
		return words.flatMap(({el, box: a}, i) =>
			words
				.slice(i + 1)
				.filter(({el: other}) => !el.closest(".stat")?.contains(other))
				.filter(({box: b}) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
				.map(({el: other}) => `${el.textContent} / ${other.textContent}`),
		);
	});

const CONTROLS = ["#undoBtn", "#resetBtn", "#hintBtn", "#dpad button", "#menuBtn"];

for (const screen of SCREENS)
{
	test.describe(screen.name, () =>
	{
		test("a pinch that starts on the controls leaves the page's zoom alone and the controls in reach", async ({
			browser,
		}) =>
		{
			const {context, page, cdp} = await openLevel16(browser, screen);
			const start = await cubeAt(page);
			const report: Record<string, unknown> = {};
			for (const [first, second] of [
				["#resetBtn", "#hintBtn"],
				["#net", "#hintBtn"],
				['#dpad [data-d="W"]', '#dpad [data-d="E"]'],
				["#menuBtn", "#moves"],
				["#status", "#hintBtn"],
			] as const)
			{
				await spreadOn(page, cdp, first, second);
				report[`${first} and ${second}`] =
				{
					scale: await pageScale(page),
					out: await unreachable(page, CONTROLS),
				};
			}
			await page.screenshot(
				{
					path: test.info().outputPath("after-control-pinch.png"),
				},
			);
			const clean =
			{
				scale: 1,
				out: [],
			};
			expect(report).toStrictEqual(
				{
					"#resetBtn and #hintBtn": clean,
					"#net and #hintBtn": clean,
					'#dpad [data-d="W"] and #dpad [data-d="E"]': clean,
					"#menuBtn and #moves": clean,
					"#status and #hintBtn": clean,
				},
			);
			expect((await cubeAt(page)).moves).toBe(start.moves);
			await context.close();
		});

		test("no screen can zoom the page, so play never opens zoomed in with no way back", async ({browser}) =>
		{
			const {context, page, cdp} = await openPhone(browser, screen, {});
			const middle: [number, number] = [screen.width / 2, screen.height / 2];
			const report: Record<string, unknown> = {};
			await spreadAcross(cdp, ...middle);
			report["title"] = await pageScale(page);
			await page.locator("#titlePlay").tap();
			await expect(page.locator("#tip")).toBeVisible();
			await spreadAcross(cdp, ...middle);
			report["tip card"] =
			{
				scale: await pageScale(page),
				out: await unreachable(page, ["#tipOk"]),
			};
			await page.locator("#tipOk").tap();
			await page.locator("#menuBtn").tap();
			await spreadAcross(cdp, ...middle);
			report["menu"] = await pageScale(page);
			await page.locator("#modeEdit").tap();
			await sleep(60);
			await spreadAcross(cdp, screen.width / 2, 24);
			report["editor"] = await pageScale(page);
			await page.locator("#modePlay").tap();
			await sleep(60);
			report["back in play"] =
			{
				scale: await pageScale(page),
				out: await unreachable(page, CONTROLS),
			};
			expect(report).toStrictEqual(
				{
					title: 1,
					"tip card":
					{
						scale: 1,
						out: [],
					},
					menu: 1,
					editor: 1,
					"back in play":
					{
						scale: 1,
						out: [],
					},
				},
			);
			await context.close();
		});

		test("the win card stays put under a pinch", async ({browser}) =>
		{
			const {context, page, cdp} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			for (const d of "EEESSS")
			{
				await page.locator(`#dpad [data-d="${d}"]`).tap();
				await settle(page);
			}
			await expect(page.locator("#win")).toBeVisible();
			await spreadAcross(cdp, screen.width / 2, screen.height / 2);
			expect(
				{
					scale: await pageScale(page),
					out: await unreachable(page, ["#winNext", "#winRetry"]),
				},
			).toStrictEqual(
				{
					scale: 1,
					out: [],
				},
			);
			await context.close();
		});

		test("a pinch across the board's edge zooms and rolls nothing, whichever finger is on the board", async ({
			browser,
		}) =>
		{
			const {context, page, cdp} = await openLevel16(browser, screen);
			const v = await rectOf(page, "#viewport");
			const status = await rectOf(page, "#status");
			const head = await rectOf(page, ".levelhead");
			const cx = (v.x + v.right) / 2;
			const statusY = (status.y + status.bottom) / 2;
			const headY = (head.y + head.bottom) / 2;
			const report: Record<string, unknown> = {};
			const cases: Record<string, [[number, number], [number, number]][]> =
			{
				"board then status": [
					[
						[cx, v.bottom - 30],
						[cx - 30, v.bottom - 110],
					],
					[
						[cx + 20, statusY],
						[cx + 50, statusY + 30],
					],
				],
				"status then board": [
					[
						[cx + 20, statusY],
						[cx + 50, statusY + 30],
					],
					[
						[cx, v.bottom - 30],
						[cx - 30, v.bottom - 110],
					],
				],
				"board then header": [
					[
						[cx, v.y + 30],
						[cx + 30, v.y + 110],
					],
					[
						[cx + 60, headY],
						[cx + 90, Math.max(2, headY - 40)],
					],
				],
			};
			for (const [name, paths] of Object.entries(cases))
			{
				await together(cdp, paths);
				await settle(page);
				report[name] =
				{
					moves: (await cubeAt(page)).moves,
					zoomed: (await cameraOf(page)).zoom > 1,
				};
				await refit(page);
			}
			const clean =
			{
				moves: 0,
				zoomed: true,
			};
			expect(report).toStrictEqual(
				{
					"board then status": clean,
					"status then board": clean,
					"board then header": clean,
				},
			);
			await context.close();
		});

		test("a pinch with one finger held still or drifting zooms and rolls nothing", async ({browser}) =>
		{
			const {context, page, cdp} = await openLevel16(browser, screen);
			const [cx, cy] = await viewportCentre(page);
			const report: Record<string, unknown> = {};
			for (const [name, thumb] of [
				["still", cx - 40],
				["drifting", cx - 48],
			] as const)
			{
				await together(
					cdp,
					[
						[
							[cx - 40, cy],
							[thumb, cy],
						],
						[
							[cx + 10, cy],
							[cx + 90, cy],
						],
					],
					12,
				);
				await settle(page);
				report[name] =
				{
					moves: (await cubeAt(page)).moves,
					zoomed: (await cameraOf(page)).zoom > 1,
				};
				await refit(page);
			}
			expect(report).toStrictEqual(
				{
					still:
					{
						moves: 0,
						zoomed: true,
					},
					drifting:
					{
						moves: 0,
						zoomed: true,
					},
				},
			);
			await context.close();
		});

		test("a thumb resting since before the swipe still does not block it, even if it jitters", async ({browser}) =>
		{
			const {context, page, cdp} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			const [cx, cy] = await viewportCentre(page);
			const thumb = (dx: number) => (
			{
				id: 2,
				x: cx + 90 + dx,
				y: cy + 40,
			});
			const up = (i: number) => (
			{
				id: 1,
				x: cx,
				y: cy + 20 - i * 12,
			});
			await fingerScript(cdp, [
				[thumb(0)],
				REST,
				[thumb(0), up(0)],
				[thumb(4), up(1)],
				[thumb(7), up(2)],
				[thumb(5), up(3)],
				[thumb(8), up(4)],
				[thumb(8)],
				[],
			]);
			expect(await rolled(page)).toBe("N");
			await context.close();
		});

		test("a rigid two-finger pan never changes the zoom, at the fit or at the most zoomed", async ({browser}) =>
		{
			const {context, page, cdp} = await openLevel16(browser, screen);
			const [cx, cy] = await viewportCentre(page);
			const pan = async (spacing: number, by: number, steps: number, flip = false) =>
			{
				const a: [[number, number], [number, number]] = [
					[cx, cy],
					[cx + by, cy],
				];
				const b: [[number, number], [number, number]] = [
					[cx + spacing, cy],
					[cx + spacing + by, cy],
				];
				await together(cdp, flip ? [b, a] : [a, b], steps);
			};
			const report: Record<string, unknown> = {};
			await pan(120, -50, 8);
			await pan(80, 50, 8, true);
			await pan(80, 0, 1);
			report["at fit"] =
			{
				zoom: (await cameraOf(page)).zoom,
				fitButton: await page.locator("#fitBtn").isVisible(),
			};
			for (let i = 0; i < 3; i++)
				await together(
					cdp,
					[
						[
							[cx - 20, cy],
							[Math.max(2, cx - 150), cy],
						],
						[
							[cx + 20, cy],
							[Math.min(screen.width - 2, cx + 150), cy],
						],
					],
					10,
				);
			report["reached the most"] = (await cameraOf(page)).zoom;
			for (let i = 0; i < 6; i++) await pan(60, i % 2 ? 100 : -100, 3, i % 3 === 0);
			report["after pans"] = (await cameraOf(page)).zoom;
			expect(report).toStrictEqual(
				{
					"at fit":
					{
						zoom: 1,
						fitButton: false,
					},
					"reached the most": 5,
					"after pans": 5,
				},
			);
			await context.close();
		});

		test("a two-finger pan whose spacing wobbles a little stays a pan", async ({browser}) =>
		{
			const {context, page, cdp} = await openLevel16(browser, screen);
			const [cx, cy] = await viewportCentre(page);
			const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
				{
					id: 1,
					x: cx - 40 - i * 5,
					y: cy,
				},
				{
					id: 2,
					x: cx + 40 - i * 5 + (i % 2 ? 4 : 0),
					y: cy,
				},
			]);
			await fingerScript(cdp, [...frames.flatMap((frame) => [frame, 20]), []]);
			expect(
				{
					zoom: (await cameraOf(page)).zoom,
					moves: (await cubeAt(page)).moves,
				},
			).toStrictEqual(
				{
					zoom: 1,
					moves: 0,
				},
			);
			await context.close();
		});

		test("a fast two-finger pan at low zoom moves the board its whole way, in either finger order", async ({
			browser,
		}) =>
		{
			const {context, page, cdp} = await openLevel16(browser, screen);
			const [cx, cy] = await viewportCentre(page);
			const moved: Record<string, number> = {};
			for (const flip of [false, true])
			{
				await refit(page);
				await together(cdp, [
					[
						[cx - 30, cy],
						[cx - 75, cy],
					],
					[
						[cx + 30, cy],
						[cx + 75, cy],
					],
				]);
				const a: [[number, number], [number, number]] = [
					[cx + 20, cy],
					[cx - 40, cy],
				];
				const b: [[number, number], [number, number]] = [
					[cx + 70, cy],
					[cx + 10, cy],
				];
				const before = await cameraOf(page);
				await together(cdp, flip ? [b, a] : [a, b], 6, 14);
				const after = await cameraOf(page);
				moved[flip ? "flipped" : "plain"] = Math.round(after.x - before.x);
				expect(after.zoom).toBe(before.zoom);
			}
			expect(moved).toStrictEqual(
				{
					plain: -60,
					flipped: -60,
				},
			);
			await context.close();
		});

		test("the pan stops with the board still in view, and the next level starts from the fit", async ({browser}) =>
		{
			const {context, page, cdp} = await openLevel16(browser, screen);
			const [cx, cy] = await viewportCentre(page);
			await together(cdp, [
				[
					[cx - 30, cy],
					[cx - 90, cy],
				],
				[
					[cx + 30, cy],
					[cx + 90, cy],
				],
			]);
			for (let i = 0; i < 8; i++)
				await together(cdp, [
					[
						[cx + 40, cy],
						[cx - 40, cy],
					],
					[
						[cx + 90, cy],
						[cx + 10, cy],
					],
				]);
			const board = await rectOf(page, "#board");
			const view = await rectOf(page, "#viewport");
			expect(board.right > view.x + (view.right - view.x) * 0.7).toBe(true);
			await openFromMenu(page, "9");
			expect(
				{
					camera: await cameraOf(page),
					fit: await page.locator("#fitBtn").isVisible(),
				},
			).toMatchObject(
				{
					camera:
					{
						zoom: 1,
					},
					fit: false,
				},
			);
			expect(await clippedTiles(page)).toBe(0);
			await context.close();
		});

		test("each d-pad arrow points along the axis it rolls on", async ({browser}) =>
		{
			const {context, page} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			const axes = await measuredAxes(page);
			const drawn = await page.evaluate(() =>
			{
				const angles: Record<string, number> = {};
				for (const button of document.querySelectorAll<HTMLElement>("#dpad button"))
				{
					const d = button.dataset["d"]!;
					const base =
					{
						N: -90,
						S: 90,
						W: 180,
						E: 0,
					}[d]!;
					const matrix = new DOMMatrix(getComputedStyle(button, "::before").transform);
					angles[d] = base + (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
				}
				return angles;
			});
			const off = Object.fromEntries(
				Object.entries(axes).map(([d, angle]) => [d, Math.abs(((angle - drawn[d]! + 540) % 360) - 180) < 3]),
			);
			expect(off).toStrictEqual(
				{
					E: true,
					S: true,
					W: true,
					N: true,
				},
			);
			await context.close();
		});

		test("the row of actions never scrolls, and More reaches the rest with Undo still in reach", async ({
			browser,
		}) =>
		{
			const {context, page} = await openLevel16(browser, screen);
			const row = page.locator("#undoBtn").locator("..");
			expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
			const core = ["#undoBtn", "#resetBtn", "#hintBtn", "#moreBtn"];
			expect(await unreachable(page, core)).toStrictEqual([]);
			await expect(page.locator("#solBtn")).toBeHidden();
			await page.locator("#moreBtn").tap();
			expect(await unreachable(page, [...core, "#solBtn", "#editCopy"])).toStrictEqual([]);
			await page.screenshot(
				{
					path: test.info().outputPath("more.png"),
				},
			);
			await page.locator("#solBtn").tap();
			await expect(page.locator("#solBox")).toBeVisible();
			await expect(page.locator("#editCopy")).toBeHidden();
			expect(await unreachable(page, ["#undoBtn", "#resetBtn", "#hintBtn"])).toStrictEqual([]);
			await page.locator("#moreBtn").tap();
			await expect(page.locator("#editCopy")).toBeVisible();
			const v = await rectOf(page, "#viewport");
			await page.touchscreen.tap((v.x + v.right) / 2, v.bottom - 6);
			await expect(page.locator("#editCopy")).toBeHidden();
			await context.close();
		});

		test("Infinite's Skip and New sit under More, on screen", async ({browser}) =>
		{
			const {context, page} = await openPhone(browser, screen);
			await page.locator("#titleInf").tap();
			await sleep(100);
			if (await page.locator("#tip").isVisible()) await page.locator("#tipOk").tap();
			await page.locator("#moreBtn").tap();
			expect(await unreachable(page, ["#infSkip", "#infNew", "#editCopy", "#undoBtn"])).toStrictEqual([]);
			await page.screenshot(
				{
					path: test.info().outputPath("infinite.png"),
				},
			);
			expect(await page.locator("#infCard").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
			await context.close();
		});

		test("Test play's header has no words on top of each other", async ({browser}) =>
		{
			const {context, page} = await openPhone(browser, screen);
			await page.locator("#titleEdit").tap();
			await sleep(60);
			await page.locator("#edTest").tap();
			await sleep(150);
			while (await page.locator("#tip").isVisible()) await page.locator("#tipOk").tap();
			const backLines = await page
				.locator("#backEdit")
				.evaluate((back) => Math.round(back.getBoundingClientRect().height / 20) <= 2);
			const hits = await headerOverlaps(page);
			await page.screenshot(
				{
					path: test.info().outputPath("testplay.png"),
				},
			);
			expect(
				{
					hits,
					backLines,
				},
			).toStrictEqual(
				{
					hits: [],
					backLines: true,
				},
			);
			expect(await unreachable(page, ["#backEdit", "#menuBtn", "#moves", "#par"])).toStrictEqual([]);
			await context.close();
		});

		for (const level of ["M1", "M2", "M3", "M4"])
		{
			test(`${level}'s longer level number stays clear of the stats`, async ({browser}) =>
			{
				const {context, page} = await openPhone(browser, screen);
				await page.locator("#titlePlay").tap();
				await sleep(100);
				while (await page.locator("#tip").isVisible()) await page.locator("#tipOk").tap();
				await page.locator("#menuBtn").tap();
				await page
					.getByRole(
						"button",
						{
							name: level,
							exact: true,
						},
					)
					.tap();
				await sleep(150);
				while (await page.locator("#tip").isVisible()) await page.locator("#tipOk").tap();
				await expect(page.locator("#lvNum")).toHaveText(`Merge level ${level.slice(1)} of 4`);
				const hits = await headerOverlaps(page);
				await page.screenshot(
					{
						path: test.info().outputPath(`${level}.png`),
					},
				);
				expect(hits).toStrictEqual([]);
				expect(await unreachable(page, ["#menuBtn", "#moves", "#par"])).toStrictEqual([]);
				await context.close();
			});
		}

		test("the editor takes a pinch with one finger off the grid, whichever landed first", async ({browser}) =>
		{
			const {context, page, cdp} = await openEditor(browser, screen);
			const cellAt = async (x: number, y: number): Promise<[number, number]> =>
			{
				const box = (await page.locator(`#edGrid [data-x="${x}"][data-y="${y}"]`).boundingBox())!;
				return [box.x + box.width / 2, box.y + box.height / 2];
			};
			const start = await gridState(page);
			const scroll0 = await page.evaluate(() => scrollY);
			const [ax, ay] = await cellAt(3, 4);
			const grid = await rectOf(page, "#edGrid");
			const off: [number, number] = [ax, grid.bottom + 16];
			await fingerScript(cdp, [
				[
					{
						id: 1,
						x: ax,
						y: ay,
					},
				],
				15,
				[
					{
						id: 1,
						x: ax,
						y: ay,
					},
					{
						id: 2,
						x: off[0],
						y: off[1],
					},
				],
				...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => [
					{
						id: 1,
						x: ax,
						y: ay - i * 6,
					},
					{
						id: 2,
						x: off[0],
						y: off[1] + i * 6,
					},
				]),
				[],
			]);
			const first = await gridState(page);
			expect(first.code).toBe(start.code);
			expect(parseFloat(first.cell) > parseFloat(start.cell)).toBe(true);
			await page.locator('[data-resize="1,0"]').evaluate((el: HTMLElement) =>
			{
				el.click();
			});
			await page.locator('[data-resize="-1,0"]').evaluate((el: HTMLElement) =>
			{
				el.click();
			});
			await sleep(60);
			const reset = await gridState(page);
			expect(reset.cell).toBe(start.cell);
			await page.evaluate((y) =>
			{
				scrollTo(0, y);
			}, scroll0);
			await sleep(60);
			const [bx, by] = await cellAt(3, 4);
			const grid2 = await rectOf(page, "#edGrid");
			const off2: [number, number] = [bx, grid2.bottom + 16];
			const before = await gridState(page);
			await fingerScript(cdp, [
				[
					{
						id: 1,
						x: off2[0],
						y: off2[1],
					},
				],
				15,
				[
					{
						id: 1,
						x: off2[0],
						y: off2[1],
					},
					{
						id: 2,
						x: bx,
						y: by,
					},
				],
				...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => [
					{
						id: 1,
						x: off2[0],
						y: off2[1] + i * 6,
					},
					{
						id: 2,
						x: bx,
						y: by - i * 6,
					},
				]),
				[],
			]);
			expect((await gridState(page)).code).toBe(before.code);
			expect(await page.evaluate(() => scrollY)).toBe(scroll0);
			await context.close();
		});

		test("a second finger on the grid stops the paint as it lands, however late", async ({browser}) =>
		{
			const {context, page, cdp} = await openEditor(browser, screen);
			const cellAt = async (x: number, y: number): Promise<[number, number]> =>
			{
				const box = (await page.locator(`#edGrid [data-x="${x}"][data-y="${y}"]`).boundingBox())!;
				return [box.x + box.width / 2, box.y + box.height / 2];
			};
			const [ax, ay] = await cellAt(1, 2);
			const [bx, by] = await cellAt(5, 2);
			const [tx, ty] = await cellAt(3, 2);
			await fingerScript(cdp, [
				[
					{
						id: 1,
						x: ax,
						y: ay,
					},
				],
				600,
				[
					{
						id: 1,
						x: ax,
						y: ay,
					},
					{
						id: 2,
						x: bx,
						y: by,
					},
				],
			]);
			const held = await gridState(page);
			await fingerScript(cdp, [
				[
					{
						id: 1,
						x: ax,
						y: ay,
					},
					{
						id: 2,
						x: bx,
						y: by,
					},
				],
				[
					{
						id: 1,
						x: tx,
						y: ty,
					},
					{
						id: 2,
						x: bx,
						y: by,
					},
				],
				[],
			]);
			expect((await gridState(page)).code).toBe(held.code);
			await context.close();
		});

		test("a slow pinch on the editor's grid zooms as far as a quick one", async ({browser}) =>
		{
			const {context, page, cdp} = await openEditor(browser, screen);
			const grid = await rectOf(page, "#edGrid");
			const cx = (grid.x + grid.right) / 2;
			const cy = (grid.y + grid.bottom) / 2;
			const before = parseFloat((await gridState(page)).cell);
			await together(
				cdp,
				[
					[
						[cx - 30, cy],
						[cx - 40, cy],
					],
					[
						[cx + 30, cy],
						[cx + 40, cy],
					],
				],
				40,
				20,
			);
			const wanted = Math.min(56, (before * 80) / 60);
			const after = parseFloat((await gridState(page)).cell);
			expect(Math.abs(after - wanted) <= 2).toBe(true);
			await context.close();
		});
	});
}

test("at 320 wide the third hint step leaves the board tiles a readable size", async ({browser}) =>
{
	const {context, page} = await openLevel16(browser, SCREENS[0]!);
	await page.locator("#hintBtn").tap();
	await sleep(250);
	for (const _ of [1, 2])
	{
		await page.locator("#hintMore").tap();
		await sleep(250);
	}
	await expect(page.locator("#hintStep")).toHaveText("Hint 3 of 3");
	const measured = await page.evaluate(() => (
	{
		board: Math.round(document.querySelector("#viewport")!.getBoundingClientRect().height),
		cell: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--c")),
		textScrolls: getComputedStyle(document.querySelector("#hintText")!).overflowY,
	}));
	await page.screenshot(
		{
			path: test.info().outputPath("hint3.png"),
		},
	);
	expect(
		{
			bigBoard: measured.board >= 150,
			readable: measured.cell >= 14,
			textScrolls: measured.textScrolls,
		},
	).toStrictEqual(
		{
			bigBoard: true,
			readable: true,
			textScrolls: "auto",
		},
	);
	expect(await clippedTiles(page)).toBe(0);
	expect(await unreachable(page, ["#hintClose", "#undoBtn", "#dpad button"])).toStrictEqual([]);
	await context.close();
});

for (const [width, height] of [
	[568, 262],
	[640, 288],
	[568, 232],
	[844, 300],
] as const)
	test(`a phone with toolbars at ${width}x${height} keeps the rail's parts apart`, async ({browser}) =>
	{
		const {context, page} = await openLevel16(
			browser,
			{
				name: "short",
				width,
				height,
			},
		);
		await page.screenshot(
			{
				path: test.info().outputPath("rail.png"),
			},
		);
		const overlaps = await page.evaluate(() =>
		{
			const parts = ["#net", "#needBox", "#undoBtn", "#resetBtn", "#hintBtn", "#moreBtn", "#dpad", "#moves"];
			const boxes = parts.map((selector) => document.querySelector(selector)!.getBoundingClientRect());
			const hits: string[] = [];
			boxes.forEach((a, i) =>
			{
				boxes.slice(i + 1).forEach((b, j) =>
				{
					if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
						hits.push(`${parts[i]} on ${parts[i + 1 + j]}`);
				});
			});
			return hits;
		});
		expect(overlaps).toStrictEqual([]);
		expect(await unreachable(page, ["#net", "#undoBtn", "#resetBtn", "#hintBtn", "#dpad button"])).toStrictEqual(
			[],
		);
		await page.locator("#moreBtn").tap();
		expect(await unreachable(page, ["#solBtn", "#editCopy", "#undoBtn"])).toStrictEqual([]);
		await context.close();
		const infinite = await openPhone(
			browser,
			{
				name: "short",
				width,
				height,
			},
		);
		await infinite.page.locator("#titleInf").tap();
		await sleep(100);
		if (await infinite.page.locator("#tip").isVisible()) await infinite.page.locator("#tipOk").tap();
		await infinite.page.locator("#moreBtn").tap();
		expect(await unreachable(infinite.page, ["#infSkip", "#infNew", "#editCopy"])).toStrictEqual([]);
		await infinite.context.close();
	});

test("Safari's own pinch event is refused anywhere on a phone-sized page, and nowhere on a desktop", async ({
	browser,
}) =>
{
	const refused = async (page: Page, selector: string): Promise<boolean> =>
		page.evaluate((target) =>
		{
			const event = new Event(
				"gesturestart",
				{
					bubbles: true,
					cancelable: true,
				},
			);
			document.querySelector(target)!.dispatchEvent(event);
			return event.defaultPrevented;
		}, selector);
	const phone = await openPhone(browser, SCREENS[0]!);
	expect(await refused(phone.page, "#titlePlay")).toBe(true);
	expect(await refused(phone.page, "#hintBtn")).toBe(true);
	await phone.context.close();
	const desktop = await browser.newPage();
	await desktop.goto(`${BASE_URL}/`);
	expect(await refused(desktop, "#titlePlay")).toBe(false);
	await desktop.close();
});
