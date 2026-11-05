import {expect, type Page, test} from "@playwright/test";
import {readSolveGolden} from "../support/golden.ts";
import {keyFor} from "../support/paths.ts";
import {atLevel, MOBILE} from "./harness/page.ts";
import {withSession} from "./harness/session.ts";
import {holdBeforeLift} from "./harness/touch.ts";

const golden = readSolveGolden("solve-post-fix.json");
const pathOf = (index: number): string => golden[index]!.path!;

test("palette: swatches, picker, sliders, numbers, hex, resets and persistence", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await session.click("#titlePlay");
			await session.click("#palBtn");
			for (const k of ["o", "y", "g", "c", "b", "p", "r"]) await session.click(`#palSwatches [data-k="${k}"]`);
			const fill = async (id: string, v: string) =>
				session.step(`set ${id} to ${v}`, async (page) => page.locator(id).fill(v));
			await fill("#palPick", "#112233");
			expect(JSON.parse(session.last.storage["cubist-colors-v1"]!)).toStrictEqual(
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
			expect(JSON.parse(session.last.storage["cubist-colors-v1"]!)).toStrictEqual(
				{
					r: "#ff0001",
				},
			);
			await fill("#palHex", "abc");
			await fill("#palHex", "ABCDEF");
			await fill("#palHex", "#123456");
			await session.step("blur the hex field", async (page) => page.locator("#palHex").blur());
			await session.click(`#palSwatches [data-k="b"]`);
			await fill("#palHex", "#654321");
			await session.press("Escape", "escape closes the palette");
			await session.click("#palBtn");
			await session.click("#palResetOne");
			expect(JSON.parse(session.last.storage["cubist-colors-v1"]!)).toStrictEqual(
				{
					r: "#123456",
				},
			);
			await session.click("#palClose");
			await session.reload();
			await session.click("#titlePlay", "custom color survives a reload");
			await session.roll(pathOf(1).slice(0, 1));
			await session.click("#palBtn");
			await session.click("#viewport", "clicking outside closes the palette");
			await session.click("#palBtn");
			await session.click("#palResetAll");
			expect(session.last.storage["cubist-colors-v1"]).toBe("{}");
		},
	);
});

test("sound: toggle, M key, persistence and the exact audio call sequence", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(8),
		},
		async (session) =>
		{
			const started = await session.click("#titlePlay", "the first press wakes the audio context");
			expect(started.audio[0]).toStrictEqual(["new AudioContext"]);
			const on = await session.press(keyFor(pathOf(8)[0]!), "a roll with sound on");
			expect(on.audio.length).toBeGreaterThan(10);
			await session.click("#topbar .soundbtn", "mute");
			expect(session.last.storage["cubist-sound-v1"]).toBe("off");
			expect(await session.page.locator("#topbar .soundbtn .lbl").textContent()).toBe("Sound off");
			const muted = await session.press(keyFor(pathOf(8)[1]!), "a muted roll is silent");
			expect(muted.audio).toStrictEqual([]);
			await session.reload();
			const reloaded = await session.click("#titlePlay", "mute survives a reload");
			expect(reloaded.audio).toStrictEqual([]);
			const unmuted = await session.press("m", "M unmutes and clicks");
			expect(unmuted.storage["cubist-sound-v1"]).toBe("on");
			expect(unmuted.audio.length).toBeGreaterThan(0);
			await session.press("M", "M mutes");
			await session.press("M", "M unmutes");
			const won = await session.roll(pathOf(8));
			expect(won.win.hidden).toBe(false);
			await session.click("#winRetry");
			await session.step("title sound button", async (page) =>
			{
				await page.locator(".brand").click();
				await page.locator(".title-sound .soundbtn").click();
			});
			expect(session.last.storage["cubist-sound-v1"]).toBe("off");
			await session.step("M in a text field does not toggle", async (page) =>
			{
				await page.locator("#titleEdit").click();
				await page.locator("#edName").fill("");
				await page.keyboard.type("Mm");
			});
			expect(session.last.storage["cubist-sound-v1"]).toBe("off");
		},
	);
});

test("every sound effect a campaign level can trigger", async ({browser}) =>
{
	const COVERAGE = [9, 25, 28];
	for (const index of COVERAGE)
	{
		await withSession(
			browser,
			{
				storage: atLevel(index, false),
			},
			async (session) =>
			{
				await session.click("#titlePlay");
				await session.dismissTips();
				const won = await session.roll(pathOf(index));
				expect(won.win.hidden).toBe(false);
				await session.click("#winRetry");
				await session.press("h", "hint chime");
				await session.roll(pathOf(index).slice(0, 1));
				await session.press("z", "undo blip");
			},
		);
	}
});

test("reduced motion: no scripted animations, no timers on rolls, same rules", async ({browser}) =>
{
	await withSession(
		browser,
		{
			reducedMotion: true,
			storage: atLevel(8),
		},
		async (session) =>
		{
			await session.click("#titlePlay");
			const rolled = await session.roll(pathOf(8).slice(0, 2));
			expect(rolled.animations).toStrictEqual([]);
			await session.press("Enter", "enter does nothing mid level");
			const blocked = await session.press("ArrowUp", "blocked or free roll with no tilt");
			expect(blocked.animations).toStrictEqual([]);
			await session.press("r");
			await session.click("#solBtn");
			await session.click("#solAll");
			const interval = await session.tickIntervals(2);
			expect(interval.solution.text).toBe(
				`Showing 3 of ${pathOf(8).length} rolls. Follow the arrows in number order, or reveal more.`,
			);
			await session.tickIntervals(pathOf(8).length);
			const won = await session.roll(pathOf(8));
			expect(won.win.title).toBe("Solved");
		},
	);
});

test("normal motion: the roll and tilt animations are the expected ones", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(0),
		},
		async (session) =>
		{
			await session.click("#titlePlay");
			const roll = await session.press("ArrowRight", "a free roll");
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
			const tilt = await session.press("ArrowUp", "a tilt at the edge");
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
	await withSession(
		browser,
		{
			viewport: MOBILE,
			mobile: true,
			storage: atLevel(1),
		},
		async (session) =>
		{
			await session.step("tap play", async (page) => page.locator("#titlePlay").tap());
			expect(session.last.hud.num).toBe("Level 2 of 31");
			const ignored = await session.step("a too-short swipe", async (page) => swipe(page, 10, 5));
			expect(ignored.hud.moves).toBe("0");
			const swiped = await session.step("swipe east", async (page) => swipe(page, 60, 0));
			expect(swiped.hud.moves).toBe("1");
			await session.step("swipe north", async (page) => swipe(page, 0, -60));
			await session.step("swipe south", async (page) => swipe(page, 0, 60));
			await session.step("swipe west", async (page) => swipe(page, -60, 0));
			await session.step("tap undo", async (page) => page.locator("#undoBtn").tap());
			await session.step("tap restart", async (page) => page.locator("#resetBtn").tap());
			const path = pathOf(1);
			for (const [i, d] of Array.from(path).entries())
			{
				if (i % 2 === 0)
				{
					const [dx, dy] = SWIPES[d]!;
					await session.step(`swipe ${d} ${i}`, async (page) => swipe(page, dx, dy));
				}
				else
				{
					await session.step(`d-pad ${d} ${i}`, async (page) => page.locator(`#dpad [data-d="${d}"]`).tap());
				}
			}
			expect(session.last.win.hidden).toBe(false);
			await session.step("tap next", async (page) => page.locator("#winNext").tap());
			await session.step("open editor from the mode bar", async (page) => page.locator("#modeEdit").tap());
			await session.step("tap a tile in the editor", async (page) =>
				page.locator('#edGrid [data-x="1"][data-y="1"]').tap(),
			);
		},
	);
});

test("mobile with reduced motion", async ({browser}) =>
{
	await withSession(
		browser,
		{
			viewport: MOBILE,
			mobile: true,
			reducedMotion: true,
			storage: atLevel(0, false),
		},
		async (session) =>
		{
			await session.step("tap play", async (page) => page.locator("#titlePlay").tap());
			await session.dismissTips();
			for (const d of pathOf(0))
			{
				const [dx, dy] = SWIPES[d]!;
				await session.step(`swipe ${d}`, async (page) => swipe(page, dx, dy));
			}
			expect(session.last.win.hidden).toBe(false);
		},
	);
});
