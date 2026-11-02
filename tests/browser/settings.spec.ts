import {expect, type Page, test} from "@playwright/test";
import {readSolveGolden} from "../support/golden.ts";
import {keyFor} from "../support/paths.ts";
import {atLevel, DESKTOP, MOBILE, withPair} from "./harness/pair.ts";
import {holdBeforeLift} from "./harness/touch.ts";

const golden = readSolveGolden("solve-post-fix.json");
const pathOf = (index: number): string => golden[index]!.path!;

test("palette: swatches, picker, sliders, numbers, hex, resets and persistence", async ({browser}) =>
{
	await withPair(
		browser,
		{
			storage: atLevel(1),
		},
		async (pair) =>
		{
			await pair.click("#titlePlay");
			await pair.click("#palBtn");
			for (const k of ["o", "y", "g", "c", "b", "p", "r"]) await pair.click(`#palSwatches [data-k="${k}"]`);
			const fill = async (id: string, v: string) =>
				pair.step(`set ${id} to ${v}`, async (page) => page.locator(id).fill(v));
			await fill("#palPick", "#112233");
			expect(JSON.parse(pair.last.storage["cubist-colors-v1"]!)).toStrictEqual(
				{
					r: "#112233",
				},
			);
			await fill("#palR", "200");
			await fill("#palG", "10");
			await fill("#palB", "90");
			await fill("#palRn", "999");
			await fill("#palGn", "0");
			await fill("#palBn", "1");
			expect(JSON.parse(pair.last.storage["cubist-colors-v1"]!)).toStrictEqual(
				{
					r: "#ff0001",
				},
			);
			await fill("#palHex", "abc");
			await fill("#palHex", "ABCDEF");
			await fill("#palHex", "#123456");
			await pair.step("blur the hex field", async (page) => page.locator("#palHex").blur());
			await pair.click(`#palSwatches [data-k="b"]`);
			await fill("#palHex", "#654321");
			await pair.press("Escape", "escape closes the palette");
			await pair.click("#palBtn");
			await pair.click("#palResetOne");
			expect(JSON.parse(pair.last.storage["cubist-colors-v1"]!)).toStrictEqual(
				{
					r: "#123456",
				},
			);
			await pair.click("#palClose");
			await pair.reload();
			await pair.click("#titlePlay", "custom color survives a reload");
			await pair.roll(pathOf(1).slice(0, 1));
			await pair.click("#palBtn");
			await pair.click("#viewport", "clicking outside closes the palette");
			await pair.click("#palBtn");
			await pair.click("#palResetAll");
			expect(pair.last.storage["cubist-colors-v1"]).toBe("{}");
		},
	);
});

test("sound: toggle, M key, persistence and the exact audio call sequence", async ({browser}) =>
{
	await withPair(
		browser,
		{
			storage: atLevel(8),
		},
		async (pair) =>
		{
			const started = await pair.click("#titlePlay", "the first press wakes the audio context");
			expect(started.audio[0]).toStrictEqual(["new AudioContext"]);
			const on = await pair.press(keyFor(pathOf(8)[0]!), "a roll with sound on");
			expect(on.audio.length).toBeGreaterThan(10);
			await pair.click("#topbar .soundbtn", "mute");
			expect(pair.last.storage["cubist-sound-v1"]).toBe("off");
			expect(await pair.legacy.locator("#topbar .soundbtn .lbl").textContent()).toBe("Sound off");
			const muted = await pair.press(keyFor(pathOf(8)[1]!), "a muted roll is silent");
			expect(muted.audio).toStrictEqual([]);
			await pair.reload();
			const reloaded = await pair.click("#titlePlay", "mute survives a reload");
			expect(reloaded.audio).toStrictEqual([]);
			const unmuted = await pair.press("m", "M unmutes and clicks");
			expect(unmuted.storage["cubist-sound-v1"]).toBe("on");
			expect(unmuted.audio.length).toBeGreaterThan(0);
			await pair.press("M", "M mutes");
			await pair.press("M", "M unmutes");
			const won = await pair.roll(pathOf(8));
			expect(won.win.hidden).toBe(false);
			await pair.click("#winRetry");
			await pair.step("title sound button", async (page) =>
			{
				await page.locator(".brand").click();
				await page.locator(".title-sound .soundbtn").click();
			});
			expect(pair.last.storage["cubist-sound-v1"]).toBe("off");
			await pair.step("M in a text field does not toggle", async (page) =>
			{
				await page.locator("#titleEdit").click();
				await page.locator("#edName").fill("");
				await page.keyboard.type("Mm");
			});
			expect(pair.last.storage["cubist-sound-v1"]).toBe("off");
		},
	);
});

test("every sound effect a campaign level can trigger", async ({browser}) =>
{
	const COVERAGE = [9, 25, 28];
	for (const index of COVERAGE)
	{
		await withPair(
			browser,
			{
				storage: atLevel(index, false),
			},
			async (pair) =>
			{
				await pair.click("#titlePlay");
				await pair.dismissTips();
				const won = await pair.roll(pathOf(index));
				expect(won.win.hidden).toBe(false);
				await pair.click("#winRetry");
				await pair.press("h", "hint chime");
				await pair.roll(pathOf(index).slice(0, 1));
				await pair.press("z", "undo blip");
			},
		);
	}
});

test("reduced motion: no scripted animations, no timers on rolls, same rules", async ({browser}) =>
{
	await withPair(
		browser,
		{
			reducedMotion: true,
			storage: atLevel(8),
		},
		async (pair) =>
		{
			await pair.click("#titlePlay");
			const rolled = await pair.roll(pathOf(8).slice(0, 2));
			expect(rolled.animations).toStrictEqual([]);
			await pair.press("Enter", "enter does nothing mid level");
			const blocked = await pair.press("ArrowUp", "blocked or free roll with no tilt");
			expect(blocked.animations).toStrictEqual([]);
			await pair.press("r");
			await pair.click("#solBtn");
			await pair.click("#solAll");
			const interval = await pair.tickIntervals(2);
			expect(interval.solution.text).toBe(
				`Showing 3 of ${pathOf(8).length} rolls. Follow the arrows in number order, or reveal more.`,
			);
			await pair.tickIntervals(pathOf(8).length);
			const won = await pair.roll(pathOf(8));
			expect(won.win.title).toBe("Solved");
		},
	);
});

test("normal motion: the roll and tilt animations are the expected ones", async ({browser}) =>
{
	await withPair(
		browser,
		{
			storage: atLevel(0),
		},
		async (pair) =>
		{
			await pair.click("#titlePlay");
			const roll = await pair.press("ArrowRight", "a free roll");
			expect(roll.animations).toStrictEqual([
				[
					"roller",
					"100% 50% 0px",
					[
						{
							transform: "none",
						},
						{
							transform: "rotateY(90deg)",
						},
					],
					{
						duration: 170,
						easing: "cubic-bezier(.45,.05,.55,.95)",
						fill: "forwards",
					},
				],
			]);
			const tilt = await pair.press("ArrowUp", "a tilt at the edge");
			expect(tilt.animations).toStrictEqual([
				[
					"roller",
					"50% 0% 0px",
					[
						{
							transform: "none",
						},
						{
							transform: "rotateX(14deg)",
						},
						{
							transform: "none",
						},
					],
					{
						duration: 220,
						easing: "ease-out",
					},
				],
			]);
		},
	);
});

const swipe = async (page: Page, dx: number, dy: number): Promise<void> =>
{
	const box = (await page.locator("#viewport").boundingBox()) as
	{
		x: number;
		y: number;
		width: number;
		height: number;
	};
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	const client = await page.context().newCDPSession(page);
	const point = (px: number, py: number) => [
		{
			x: px,
			y: py,
		},
	];
	await client.send(
		"Input.dispatchTouchEvent",
		{
			type: "touchStart",
			touchPoints: point(x, y),
		},
	);
	await client.send(
		"Input.dispatchTouchEvent",
		{
			type: "touchMove",
			touchPoints: point(x + dx, y + dy),
		},
	);
	await holdBeforeLift();
	await client.send(
		"Input.dispatchTouchEvent",
		{
			type: "touchEnd",
			touchPoints: [],
		},
	);
	await client.detach();
};
const SWIPES: Record<string, [number, number]> =
{
	N: [0, -60],
	S: [0, 60],
	E: [60, 0],
	W: [-60, 0],
};

test("mobile viewport: swipe every direction, short swipes ignored, d-pad taps, win", async ({browser}) =>
{
	await withPair(
		browser,
		{
			viewport: MOBILE,
			mobile: true,
			storage: atLevel(1),
		},
		async (pair) =>
		{
			await pair.step("tap play", async (page) => page.locator("#titlePlay").tap());
			expect(pair.last.hud.num).toBe("Level 2 of 31");
			const ignored = await pair.step("a too-short swipe", async (page) => swipe(page, 10, 5));
			expect(ignored.hud.moves).toBe("0");
			const swiped = await pair.step("swipe east", async (page) => swipe(page, 60, 0));
			expect(swiped.hud.moves).toBe("1");
			await pair.step("swipe north", async (page) => swipe(page, 0, -60));
			await pair.step("swipe south", async (page) => swipe(page, 0, 60));
			await pair.step("swipe west", async (page) => swipe(page, -60, 0));
			await pair.step("tap undo", async (page) => page.locator("#undoBtn").tap());
			await pair.step("tap restart", async (page) => page.locator("#resetBtn").tap());
			const path = pathOf(1);
			for (const [i, d] of Array.from(path).entries())
			{
				if (i % 2 === 0)
				{
					const [dx, dy] = SWIPES[d]!;
					await pair.step(`swipe ${d} ${i}`, async (page) => swipe(page, dx, dy));
				}
				else
				{
					await pair.step(`d-pad ${d} ${i}`, async (page) => page.locator(`#dpad [data-d="${d}"]`).tap());
				}
			}
			expect(pair.last.win.hidden).toBe(false);
			await pair.step("tap next", async (page) => page.locator("#winNext").tap());
			await pair.step("open editor from the mode bar", async (page) => page.locator("#modeEdit").tap());
			await pair.step("tap a tile in the editor", async (page) =>
				page.locator('#edGrid [data-x="1"][data-y="1"]').tap(),
			);
		},
	);
});

test("mobile with reduced motion", async ({browser}) =>
{
	await withPair(
		browser,
		{
			viewport: MOBILE,
			mobile: true,
			reducedMotion: true,
			storage: atLevel(0, false),
		},
		async (pair) =>
		{
			await pair.step("tap play", async (page) => page.locator("#titlePlay").tap());
			await pair.dismissTips();
			for (const d of pathOf(0))
			{
				const [dx, dy] = SWIPES[d]!;
				await pair.step(`swipe ${d}`, async (page) => swipe(page, dx, dy));
			}
			expect(pair.last.win.hidden).toBe(false);
		},
	);
});

for (const [label, viewport, mobile] of [
	["desktop", DESKTOP, false],
	["mobile", MOBILE, true],
] as const)
{
	test(`screenshots match at ${label}`, async ({browser}) =>
	{
		const options =
		{
			viewport,
			mobile,
			storage: atLevel(9, false),
		};
		await withPair(browser, options, async (pair) =>
		{
			await pair.expectSameScreenshot("title");
			await pair.click("#titlePlay");
			await pair.expectSameScreenshot("tutorial tip");
			await pair.dismissTips();
			await pair.expectSameScreenshot("level start");
			await pair.roll(pathOf(9).slice(0, 8));
			await pair.expectSameScreenshot("painted cube mid level");
			await pair.press("h");
			await pair.click("#hintMore");
			await pair.click("#hintMore");
			await pair.expectSameScreenshot("hint route");
			await pair.click("#hintClose");
			await pair.click("#solBtn");
			await pair.click("#solNext");
			await pair.click("#solGoal");
			await pair.expectSameScreenshot("solution arrows");
			await pair.click("#solHide");
			await pair.roll(pathOf(9).slice(8));
			await pair.expectSameScreenshot("win card");
			await pair.click("#winNext");
			await pair.dismissTips();
			await pair.click("#palBtn");
			await pair.expectSameScreenshot("palette");
			await pair.click("#palClose");
			await pair.click("#modeEdit");
			await pair.expectSameScreenshot("editor");
		});
	});
}
