import {expect, type Page, test} from "@playwright/test";
import {
	boardBox,
	clippedTiles,
	cubeAt,
	drag,
	fingerScript,
	gesture,
	liftAll,
	measuredAxes,
	OPEN_FLOOR,
	openFromMenu,
	openPhone,
	rolled,
	SCREENS,
	settle,
	sleep,
	unreachable,
	viewportCentre,
} from "./harness/touch.ts";
import {atLevel, BASE_URL} from "./harness/pair.ts";

/** Long enough that a thumb already down reads as resting, not as the start of a pinch with the next finger. */
const REST = 250;
const DOCK = ["#dpad button", "#undoBtn", "#resetBtn", "#hintBtn", "#net", "#moves", "#par", "#menuBtn"];
const LEVELS = ["1", "9", "16", "27", "30", "31", "M1", "M2", "M3", "M4"];

const targetSizes = async (page: Page): Promise<string[]> =>
	page.evaluate(() =>
		[...document.querySelectorAll("#dpad button, #undoBtn, #resetBtn, #hintBtn, #menuBtn")]
			.filter((el) => {
				const r = el.getBoundingClientRect();
				return r.width < 44 || r.height < 44;
			})
			.map((el) => el.id || el.textContent),
	);

for (const screen of SCREENS) {
	test.describe(screen.name, () => {
		test("every level fits the screen with the controls in reach, and the page never scrolls", async ({
			browser,
		}) => {
			const {context, page} = await openPhone(browser, screen);
			await page.locator("#titlePlay").tap();
			const report: Record<string, unknown> = {};
			for (const label of LEVELS) {
				await openFromMenu(page, label);
				report[label] = {
					clipped: await clippedTiles(page),
					unreachable: await unreachable(page, DOCK),
					smallTargets: await targetSizes(page),
					scrollable: await page.evaluate(() => {
						const doc = document.documentElement;
						return doc.scrollHeight > innerHeight || doc.scrollWidth > innerWidth;
					}),
				};
			}
			await page.screenshot({path: test.info().outputPath("level-16.png")});
			const clean = {clipped: 0, unreachable: [], smallTargets: [], scrollable: false};
			expect(report).toStrictEqual(Object.fromEntries(LEVELS.map((label) => [label, clean])));
			await context.close();
		});

		test("a swipe rolls along the drawn grid axis nearest to its direction", async ({browser}) => {
			const {context, page, cdp} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			const axes = await measuredAxes(page);
			const [cx, cy] = await viewportCentre(page);
			const off = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
			const wrong: string[] = [];
			for (let angle = -180; angle < 180; angle += 30) {
				const nearest = Object.entries(axes).toSorted((a, b) => off(a[1], angle) - off(b[1], angle));
				// Too near a boundary to say which side the rounding falls on.
				if (off(nearest[1]![1], angle) - off(nearest[0]![1], angle) < 4) continue;
				const rad = (angle * Math.PI) / 180;
				await drag(cdp, [cx, cy], [cx + Math.cos(rad) * 50, cy + Math.sin(rad) * 50]);
				const got = await rolled(page);
				if (got !== nearest[0]![0]) wrong.push(`${angle}: ${got}, wanted ${nearest[0]![0]}`);
			}
			expect(wrong).toStrictEqual([]);
			await context.close();
		});

		test("a resting thumb neither blocks nor bends a swipe", async ({browser}) => {
			const {context, page, cdp} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			const [cx, cy] = await viewportCentre(page);
			const up = (i: number) => ({id: 1, x: cx, y: cy + 20 - i * 12});
			const thumb = {id: 2, x: cx + 90, y: cy + 40};
			const results: Record<string, string> = {};
			const swipeFrames = [0, 1, 2, 3, 4, 5].map(up);
			await fingerScript(cdp, [...swipeFrames.map((f) => [f]), []]);
			results["alone"] = await rolled(page);
			await fingerScript(cdp, [
				[up(0)],
				[up(1)],
				[up(2), thumb],
				[up(3), thumb],
				[up(4), thumb],
				[up(5), thumb],
				[thumb],
				[],
			]);
			results["thumb lands mid-swipe"] = await rolled(page);
			await fingerScript(cdp, [
				[thumb],
				REST,
				[thumb, up(0)],
				[thumb, up(1)],
				[thumb, up(2)],
				[thumb, up(3)],
				[thumb, up(4)],
				[up(4)],
				[up(5)],
				[],
			]);
			results["thumb lifts first"] = await rolled(page);
			await fingerScript(cdp, [
				[thumb],
				REST,
				[thumb, up(0)],
				[thumb, up(1)],
				[thumb, up(2)],
				[thumb, up(3)],
				[thumb, up(4)],
				[thumb],
				[],
			]);
			results["swiper lifts first"] = await rolled(page);
			expect(results).toStrictEqual({
				alone: "N",
				"thumb lands mid-swipe": "N",
				"thumb lifts first": "N",
				"swiper lifts first": "N",
			});
			await context.close();
		});

		test("a short drag, and a drag that comes back, do not roll", async ({browser}) => {
			const {context, page, cdp} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			const [cx, cy] = await viewportCentre(page);
			await drag(cdp, [cx, cy], [cx + 8, cy]);
			const back = [0, 15, 30, 45, 30, 15, 0].map((dx) => [{id: 1, x: cx + dx, y: cy}]);
			await fingerScript(cdp, [...back, []]);
			expect(await cubeAt(page)).toStrictEqual({x: 3, y: 3, moves: 0});
			await context.close();
		});

		test("a drag marks the tile it would roll onto before the finger lifts", async ({browser}) => {
			const {context, page, cdp} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			const [cx, cy] = await viewportCentre(page);
			const aimed = async () =>
				page.evaluate(() =>
					[...document.querySelectorAll<HTMLElement>("#board .tile.aim")].map((tile) => {
						const c = parseFloat(getComputedStyle(tile).width);
						return [parseFloat(tile.style.left) / c, parseFloat(tile.style.top) / c];
					}),
				);
			await fingerScript(cdp, [[{id: 1, x: cx, y: cy}], [{id: 1, x: cx + 50, y: cy}]]);
			expect(await aimed()).toStrictEqual([[4, 3]]);
			await liftAll(cdp);
			expect(await aimed()).toStrictEqual([]);
			await context.close();
		});

		test("a double tap returns a zoomed board to the fit", async ({browser}) => {
			const {context, page, cdp} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			const [cx, cy] = await viewportCentre(page);
			const fit = await boardBox(page);
			await gesture(cdp, [
				[
					[cx - 30, cy],
					[cx - 90, cy],
				],
				[
					[cx + 30, cy],
					[cx + 90, cy],
				],
			]);
			expect((await boardBox(page)).width > fit.width).toBe(true);
			await drag(cdp, [cx, cy], [cx, cy], 1);
			await drag(cdp, [cx, cy], [cx, cy], 1);
			expect(await boardBox(page)).toStrictEqual(fit);
			await context.close();
		});

		test("two fingers zoom and pan the board without rolling, and it returns to fit", async ({browser}) => {
			const {context, page, cdp} = await openPhone(browser, screen);
			await page.locator("#titlePlay").tap();
			await openFromMenu(page, "16");
			const [cx, cy] = await viewportCentre(page);
			const fit = await boardBox(page);
			const start = await cubeAt(page);
			await gesture(cdp, [
				[
					[cx - 30, cy],
					[cx - 90, cy],
				],
				[
					[cx + 30, cy],
					[cx + 90, cy],
				],
			]);
			const zoomed = await boardBox(page);
			expect(zoomed.width / fit.width > 1.8).toBe(true);
			await expect(page.locator("#fitBtn")).toBeVisible();
			await gesture(cdp, [
				[
					[cx - 40, cy],
					[cx + 10, cy],
				],
				[
					[cx + 40, cy],
					[cx + 90, cy],
				],
			]);
			const panned = await boardBox(page);
			expect(Math.abs(panned.x - zoomed.x - 50) <= 7).toBe(true);
			// Perspective stretches the board a little as it slides sideways, but the zoom holds.
			expect(Math.abs(panned.width / zoomed.width - 1) < 0.03).toBe(true);
			// Pinching in past the fit stops at the fit, so the whole level stays the smallest view.
			await page.locator("#fitBtn").tap();
			await sleep(40);
			await expect(page.locator("#fitBtn")).toBeHidden();
			await gesture(cdp, [
				[
					[cx - 90, cy],
					[cx - 30, cy],
				],
				[
					[cx + 90, cy],
					[cx + 30, cy],
				],
			]);
			expect(await boardBox(page)).toStrictEqual(fit);
			expect(await clippedTiles(page)).toBe(0);
			// Neither the page nor the cube moved through any of it.
			expect(await cubeAt(page)).toStrictEqual(start);
			expect(await page.evaluate(() => [visualViewport!.scale, scrollX, scrollY])).toStrictEqual([1, 0, 0]);
			await context.close();
		});

		test("a pinch that lifts one finger at a time still counts as a pinch", async ({browser}) => {
			const {context, page, cdp} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			const [cx, cy] = await viewportCentre(page);
			await gesture(
				cdp,
				[
					[
						[cx - 30, cy],
						[cx - 70, cy],
					],
					[
						[cx + 30, cy],
						[cx + 70, cy],
					],
				],
				[1, 2],
			);
			await settle(page);
			expect(await cubeAt(page)).toStrictEqual({x: 3, y: 3, moves: 0});
			await context.close();
		});

		test("the d-pad, undo, restart and the menu work by tapping", async ({browser}) => {
			const {context, page} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			await page.locator('#dpad [data-d="E"]').tap();
			await settle(page);
			expect(await cubeAt(page)).toStrictEqual({x: 4, y: 3, moves: 1});
			await page.locator("#undoBtn").tap();
			await settle(page);
			expect(await cubeAt(page)).toStrictEqual({x: 3, y: 3, moves: 0});
			await page.locator("#menuBtn").tap();
			expect(
				await unreachable(page, ["#modePlay", "#modeEdit", "#palBtn", "#menuClose", ".brand"]),
			).toStrictEqual([]);
			await page.locator("#menuClose").tap();
			await expect(page.locator("#modeEdit")).toBeHidden();
			await context.close();
		});

		test("the first tip is short and its button is on screen", async ({browser}) => {
			const {context, page} = await openPhone(browser, screen, {});
			await page.locator("#titlePlay").tap();
			await expect(page.locator("#tip")).toBeVisible();
			expect(await page.locator("#tipBody").textContent()).toBe(
				"Swipe or use the arrows to roll. Roll the cube to the target.",
			);
			expect(await unreachable(page, ["#tipOk"])).toStrictEqual([]);
			await page.screenshot({path: test.info().outputPath("tip.png")});
			await page.locator("#tipOk").tap();
			await expect(page.locator("#tip")).toBeHidden();
			await context.close();
		});

		test("winning a level shows Next on screen", async ({browser}) => {
			const {context, page} = await openPhone(browser, screen, atLevel(30), OPEN_FLOOR);
			for (const d of "EEESSS") {
				await page.locator(`#dpad [data-d="${d}"]`).tap();
				await settle(page);
			}
			await expect(page.locator("#win")).toBeVisible();
			expect(await unreachable(page, ["#winNext", "#winRetry"])).toStrictEqual([]);
			await context.close();
		});

		test("the title's Play button is on screen", async ({browser}) => {
			const {context, page} = await openPhone(browser, screen);
			expect(await unreachable(page, ["#titlePlay"])).toStrictEqual([]);
			await context.close();
		});

		test("the hint and the solution leave the board and controls in reach", async ({browser}) => {
			const {context, page} = await openPhone(browser, screen);
			await page.locator("#titlePlay").tap();
			await openFromMenu(page, "16");
			await page.locator("#hintBtn").tap();
			await sleep(200);
			expect(await clippedTiles(page)).toBe(0);
			expect(await unreachable(page, [...DOCK, "#hintClose"])).toStrictEqual([]);
			await page.screenshot({path: test.info().outputPath("hint.png")});
			await context.close();
		});

		test("the editor grid paints with one finger and pans and zooms with two", async ({browser}) => {
			const {context, page, cdp} = await openPhone(browser, screen);
			await page.locator("#titleEdit").tap();
			await page.evaluate(() => {
				for (let i = 0; i < 10; i++) document.querySelector<HTMLElement>('[data-resize="1,0"]')!.click();
				for (let i = 0; i < 7; i++) document.querySelector<HTMLElement>('[data-resize="0,1"]')!.click();
			});
			await sleep(60);
			const overflow = await page.evaluate(() => {
				const wrap = document.querySelector("#edGridWrap")!;
				return wrap.scrollWidth - wrap.clientWidth;
			});
			expect(overflow).toBe(0);
			await page.screenshot({path: test.info().outputPath("editor.png")});
			const grid = page.locator("#edGrid");
			await grid.scrollIntoViewIfNeeded();
			const code = async () => page.locator("#edCode").inputValue();
			const cell = async (x: number, y: number): Promise<[number, number]> => {
				const box = (await page.locator(`#edGrid [data-x="${x}"][data-y="${y}"]`).boundingBox())!;
				return [box.x + box.width / 2, box.y + box.height / 2];
			};
			// Erase, so a paint shows in the share code.
			await page.locator('#edTools [data-tool="erase"]').tap();
			await grid.scrollIntoViewIfNeeded();
			const before = await code();
			const scrollBefore = await page.evaluate(() => scrollY);
			await drag(cdp, await cell(1, 0), await cell(3, 0));
			const painted = await code();
			expect(painted === before).toBe(false);
			expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
			// A second finger arriving just after the first takes back what the first painted.
			const [ax, ay] = await cell(6, 1);
			const [bx, by] = await cell(9, 1);
			await gesture(cdp, [
				[
					[ax, ay],
					[Math.max(2, ax - 120), ay],
				],
				[
					[bx, by],
					[Math.min(screen.width - 2, bx + 120), by],
				],
			]);
			expect((await code()) === painted).toBe(true);
			const zoomed = await page.evaluate(() => {
				const wrap = document.querySelector("#edGridWrap")!;
				return wrap.scrollWidth > wrap.clientWidth;
			});
			expect(zoomed).toBe(true);
			const left = await page.evaluate(() => document.querySelector("#edGridWrap")!.scrollLeft);
			await gesture(cdp, [
				[
					[ax, ay],
					[ax - 40, ay],
				],
				[
					[bx, by],
					[bx - 40, by],
				],
			]);
			const after = await page.evaluate(() => document.querySelector("#edGridWrap")!.scrollLeft);
			expect(after > left).toBe(true);
			expect((await code()) === painted).toBe(true);
			await context.close();
		});

		test("the editor's Copy link button can be tapped and copies the link", async ({browser}) => {
			const {context, page} = await openPhone(browser, screen);
			await context.grantPermissions(["clipboard-read", "clipboard-write"]);
			await page.locator("#titleEdit").tap();
			await sleep(60);
			const button = page.locator("#edCopyLink");
			await button.scrollIntoViewIfNeeded();
			const box = (await button.boundingBox())!;
			expect(box.height >= 44 && box.width >= 44).toBe(true);
			await button.tap();
			await expect(page.locator("#edCodeNote")).toHaveText("Copied.");
			const code = await page.locator("#edCode").inputValue();
			expect(await page.evaluate(async () => navigator.clipboard.readText())).toBe(`${BASE_URL}/?${code}`);
			await context.close();
		});

		test("the editor's share box selects all on a tap and loads a pasted code from a tapped Load", async ({
			browser,
		}) => {
			const {context, page} = await openPhone(browser, screen);
			await page.locator("#titleEdit").tap();
			await sleep(60);
			const box = page.locator("#edCode");
			await box.scrollIntoViewIfNeeded();
			for (const selector of ["#edCode", "#edCopy", "#edCopyLink", "#edImport"]) {
				const size = (await page.locator(selector).boundingBox())!;
				expect([selector, size.height >= 44 && size.width >= 44]).toStrictEqual([selector, true]);
			}
			await box.tap();
			await sleep(60);
			expect(
				await box.evaluate(
					(el: HTMLTextAreaElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length,
				),
			).toBe(true);
			const code =
				"CUBLITZ:" + Buffer.from(JSON.stringify({name: "Tapped", map: ["S.X"], k: {}})).toString("base64");
			await box.fill(code);
			await page.locator("#edImport").tap();
			await expect(page.locator("#edName")).toHaveValue("Tapped");
			await expect(box).toHaveValue(code);
			await context.close();
		});

		test("the editor page scrolls, and its tools stay in reach", async ({browser}) => {
			const {context, page, cdp} = await openPhone(browser, screen);
			await page.locator("#titleEdit").tap();
			await sleep(60);
			const box = (await page.locator("#edTest").boundingBox())!;
			const y0 = await page.evaluate(() => scrollY);
			// A drag from a side panel's card, which is plain page.
			await page.locator(".ed-help").scrollIntoViewIfNeeded();
			const help = (await page.locator(".ed-help").boundingBox())!;
			await drag(cdp, [help.x + 20, help.y + 8], [help.x + 20, Math.max(4, help.y - 120)]);
			await sleep(200);
			expect((await page.evaluate(() => scrollY)) > y0 || box.y < screen.height).toBe(true);
			const sizes = await page.evaluate(() => {
				const b = document.querySelector("#edColors button")!.getBoundingClientRect();
				const s = document.querySelector(".step")!.getBoundingClientRect();
				return {roundColor: b.width === b.height, stepper: s.width >= 40 && s.height >= 40};
			});
			expect(sizes).toStrictEqual({roundColor: true, stepper: true});
			const stuck = await page.evaluate(() => {
				const main = document.querySelector(".ed-main")!;
				scrollTo(0, main.getBoundingClientRect().top + scrollY + 30);
				const bar = document.querySelector(".ed-toolbar")!.getBoundingClientRect();
				const tools = document.querySelector("#edTools")!;
				return {barAtTop: bar.top === 0, oneRow: tools.scrollWidth > tools.clientWidth};
			});
			expect(stuck).toStrictEqual({barAtTop: true, oneRow: true});
			await context.close();
		});
	});
}

test("rotating the phone refits the board and keeps the swipe mapping", async ({browser}) => {
	const [portrait] = SCREENS;
	const {context, page, cdp} = await openPhone(browser, portrait!);
	await page.locator("#titlePlay").tap();
	await openFromMenu(page, "16");
	expect(await clippedTiles(page)).toBe(0);
	for (const [width, height] of [
		[568, 320],
		[320, 568],
	] as const) {
		await page.setViewportSize({width, height});
		await sleep(250);
		expect(await clippedTiles(page)).toBe(0);
		expect(await unreachable(page, DOCK)).toStrictEqual([]);
		const [cx, cy] = await viewportCentre(page);
		const moves = (await cubeAt(page)).moves;
		await drag(cdp, [cx, cy], [cx + 50, cy + 10]);
		await settle(page);
		const after = await cubeAt(page);
		expect(after.moves).toBe(moves + 1);
		await page.evaluate("undo()");
	}
	await context.close();
});

test("rotating in the middle of a roll refits once the roll ends", async ({browser}) => {
	const [portrait] = SCREENS;
	const {context, page} = await openPhone(browser, portrait!, atLevel(30), OPEN_FLOOR);
	await page.evaluate('move("E")');
	await page.setViewportSize({width: 568, height: 320});
	await settle(page);
	await sleep(350);
	expect(await clippedTiles(page)).toBe(0);
	await context.close();
});

test("a phone in WebKit gets the same layout and finger logic", async ({playwright}) => {
	// WebKit has no way to send real multi-touch, so this shows layout and the logic on PointerEvents, not gesture
	// handling, and nothing here can stand in for a real iPhone.
	// The config's launch args are Chromium's, and Linux WebKit refuses to start on an option it does not know.
	const browser = await playwright.webkit.launch({args: []});
	const report: Record<string, unknown> = {};
	for (const screen of SCREENS) {
		const context = await browser.newContext({
			viewport: {width: screen.width, height: screen.height},
			hasTouch: true,
			isMobile: true,
			storageState: {
				cookies: [],
				origins: [
					{
						origin: BASE_URL,
						localStorage: Object.entries(atLevel(30)).map(([name, value]) => ({name, value})),
					},
				],
			},
		});
		await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => route.abort());
		const page = await context.newPage();
		await page.goto(BASE_URL + OPEN_FLOOR);
		await sleep(150);
		await page.evaluate(`(async () => {
			const v = document.querySelector("#viewport");
			const r = v.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
			const fire = (type, pointerId, clientX, clientY) => v.dispatchEvent(new PointerEvent(type, {bubbles: true, pointerType: "touch", pointerId, clientX, clientY}));
			fire("pointerdown", 2, x + 60, y + 30);
			await new Promise((done) => setTimeout(done, ${REST}));
			fire("pointerdown", 1, x, y + 20);
			fire("pointermove", 1, x, y - 20);
			fire("pointerup", 2, x + 60, y + 30);
			fire("pointerup", 1, x, y - 40);
		})()`);
		// The roll commits when its animation ends, which took over 1.8s in Linux WebKit.
		await settle(page);
		const thumbs = await page.evaluate("({x: S.st.x, y: S.st.y})");
		await page.evaluate("undo()");
		await page.locator("#menuBtn").tap();
		await page.locator("#levels button", {hasText: /^16$/}).tap();
		await sleep(80);
		report[screen.name] = {thumbs, clipped: await clippedTiles(page), unreachable: await unreachable(page, DOCK)};
		await context.close();
	}
	await browser.close();
	const clean = {thumbs: {x: 3, y: 2}, clipped: 0, unreachable: []};
	expect(report).toStrictEqual(Object.fromEntries(SCREENS.map((screen) => [screen.name, clean])));
});

test("desktop stays the original: no touch stylesheet, no touch controls", async ({browser}) => {
	const context = await browser.newContext({viewport: {width: 1280, height: 800}});
	await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => route.abort());
	const page = await context.newPage();
	await page.goto(BASE_URL);
	const found = await page.evaluate(
		() =>
			document.querySelectorAll("#touchStyle, #menuBtn, #menuClose, #fitBtn").length +
			document.documentElement.classList.length,
	);
	expect(found).toBe(0);
	await context.close();
});

test("turning a tablet from the phone layout to desktop width takes the phone chrome away, and back brings it", async ({
	browser,
}) => {
	const {context, page} = await openPhone(browser, {name: "iPad portrait", width: 820, height: 1180});
	await page.locator("#titlePlay").tap();
	const chrome = async (): Promise<{buttons: string[]; help: string}> =>
		page.evaluate(() => ({
			buttons: [...document.querySelectorAll("#menuBtn, #menuClose, #moreBtn, #fitBtn")].map((el) => el.id),
			help: document.querySelector(".ed-help")!.textContent,
		}));
	const phone = {
		buttons: ["menuClose", "menuBtn", "fitBtn", "moreBtn"],
		help: "One finger paints tiles. Two fingers pan, and pinch to zoom. Puddles, gates, switches, buttons, boxes and doors use the selected color. Placing a start moves it.",
	};
	expect(await chrome()).toStrictEqual(phone);
	await page.setViewportSize({width: 1180, height: 820});
	await sleep(150);
	expect(await chrome()).toStrictEqual({
		buttons: [],
		help: "Click or drag to paint tiles. Puddles, gates, switches, buttons, boxes and doors use the selected color. Placing a start moves it.",
	});
	await page.setViewportSize({width: 820, height: 1180});
	await sleep(150);
	expect(await chrome()).toStrictEqual(phone);
	await page.locator("#menuBtn").tap();
	await expect(page.locator("#menuClose")).toBeVisible();
	await context.close();
});
