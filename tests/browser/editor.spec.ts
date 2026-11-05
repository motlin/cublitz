import {expect, type Page, test} from "@playwright/test";
import {atLevel, PINNED_NOW} from "./harness/page.ts";
import {type Session, withSession} from "./harness/session.ts";

const cell = (x: number, y: number) => `#edGrid [data-x="${x}"][data-y="${y}"]`;
const tool = (name: string) => `#edTools [data-tool="${name}"]`;
const color = (name: string) => `#edColors [data-color="${name}"]`;
const value = async (page: Page, selector: string) => page.locator(selector).inputValue();
const encode = (level: unknown) => `CUBLITZ:${Buffer.from(JSON.stringify(level)).toString("base64")}`;
const UNTITLED =
{
	name: "Untitled",
	map: ["........", "........", "S......X", "........", "........"],
	k: {},
};

const openEditor = async (session: Session) => session.click("#titleEdit");
const importCode = async (session: Session, code: string, name: string) =>
{
	await session.step(`type ${name}`, async (page) => page.locator("#edCode").fill(code));
	return session.click("#edImport", `import ${name}`);
};

test("every tile tool, color and white gate face", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openEditor(session);
			const tools = ["paint", "gate", "switch", "button", "box", "door"];
			for (const [x, name] of tools.entries())
			{
				await session.click(tool(name));
				await session.click(cell(x + 1, 0), `place ${name}`);
			}
			for (const [x, name] of ["r", "o", "y", "g", "c", "b", "p"].entries())
			{
				await session.click(color(name));
				await session.click(cell(x, 1), `place color ${name}`);
			}
			await session.click(tool("door"));
			await session.click(color("w"));
			await session.click(cell(0, 3), "white door");
			await session.click(tool("paint"), "paint refuses white and falls back to red");
			await session.click(tool("wgate"));
			for (const [x, face] of ["b", "t", "n", "s", "e", "w"].entries())
			{
				await session.click(`#edFaces [data-face="${face}"]`);
				await session.click(cell(x + 1, 3), `white gate ${face}`);
			}
			for (const [name, x, y] of [
				["wash", 1, 4],
				["floor", 2, 4],
				["erase", 3, 4],
				["goal", 4, 4],
				["start", 5, 4],
			] as const)
			{
				await session.click(tool(name));
				await session.click(cell(x, y), `place ${name}`);
			}
			const expected = JSON.parse(session.last.storage["cubist-editor-draft-v1"]!) as
			{
				grid: unknown[][];
			};
			expect(expected.grid[3]?.[1]).toStrictEqual(
				{
					t: "wgate",
					f: "b",
				},
			);
			expect(expected.grid[0]?.[6]).toStrictEqual(
				{
					t: "door",
					c: "r",
				},
			);
			await session.reload();
			await session.click("#titleEdit", "draft survives a reload");
		},
	);
});

test("drag painting, resizing to the limits, name and target needs", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openEditor(session);
			await session.click(tool("erase"));
			await session.step("drag across a row", async (page) =>
			{
				const box = async (x: number) =>
					(await page.locator(cell(x, 1)).boundingBox()) as
					{
						x: number;
						y: number;
						width: number;
						height: number;
					};
				const start = await box(1);
				await page.mouse.move(start.x + 5, start.y + 5);
				await page.mouse.down();
				for (const x of [2, 3, 4])
				{
					const b = await box(x);
					await page.mouse.move(b.x + 5, b.y + 5);
				}
				await page.mouse.up();
			});
			const dragged = JSON.parse(session.last.storage["cubist-editor-draft-v1"]!) as
			{
				grid: unknown[][];
			};
			expect(dragged.grid[1]?.slice(0, 6)).toStrictEqual([
				{
					t: "floor",
				},
				null,
				null,
				null,
				null,
				{
					t: "floor",
				},
			]);
			for (let i = 0; i < 11; i++) await session.click('[data-resize="1,0"]', `more columns ${i}`);
			for (let i = 0; i < 8; i++) await session.click('[data-resize="0,1"]', `more rows ${i}`);
			expect(await session.page.locator("#edCols").textContent()).toBe("18");
			expect(await session.page.locator("#edRows").textContent()).toBe("12");
			for (let i = 0; i < 16; i++) await session.click('[data-resize="-1,0"]', `fewer columns ${i}`);
			for (let i = 0; i < 10; i++) await session.click('[data-resize="0,-1"]', `fewer rows ${i}`);
			expect(await session.page.locator("#edCols").textContent()).toBe("3");
			expect(await session.page.locator("#edRows").textContent()).toBe("3");
			await session.click("#edNew");
			await session.step("rename", async (page) => page.locator("#edName").fill("My <level> & co"));
			for (const face of ["t", "b", "n", "s", "e", "w"])
			{
				await session.step(`need ${face}`, async (page) => page.locator(`#need-${face}`).selectOption("g"));
			}
			await session.step("clear one need", async (page) => page.locator("#need-b").selectOption(""));
			await session.click("#edCheck", "unsolvable level");
			expect(await session.page.locator("#edResult").textContent()).toBe(
				"No solution. No sequence of rolls reaches a target that satisfies its needs.",
			);
		},
	);
});

test("errors: no start, no target, two tries at save, test and check", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openEditor(session);
			await session.click("#edClear");
			expect(await value(session.page, "#edCode")).toBe("");
			expect(await session.page.locator("#edCodeNote").textContent()).toBe("Place a start tile.");
			for (const id of ["#edCheck", "#edTest", "#edSave"]) await session.click(id, `${id} without a start`);
			await session.click(tool("start"));
			await session.click(cell(0, 0));
			expect(await session.page.locator("#edCodeNote").textContent()).toBe("Place at least one target.");
			for (const id of ["#edCheck", "#edTest", "#edSave"]) await session.click(id, `${id} without a target`);
			await session.click("#edCopy", "copy with no code does nothing");
			await session.click("#edCopyLink", "copy link with no code does nothing");
		},
	);
});

test("share code round trip, older prefixes, raw JSON and bad codes", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openEditor(session);
			const code = await value(session.page, "#edCode");
			expect(code).toBe(encode(UNTITLED));
			await session.click("#edCopy");
			expect(await session.page.locator("#edCodeNote").textContent()).toBe("Copied.");
			await session.step("read the clipboard", async (page) =>
				page.evaluate(async () => navigator.clipboard.readText()),
			);

			const level =
			{
				name: "Rôund trip",
				map: ["Sr.R.X", "..1.2."],
				k:
				{
					"1": ["switch", "r"],
					"2": ["door", "r"],
				},
				need:
				{
					t: "r",
				},
			};
			const roundTrip = encode(level).replace(
				/^CUBLITZ:.*/,
				`CUBLITZ:${Buffer.from(JSON.stringify(level)).toString("base64")}`,
			);
			await importCode(session, roundTrip, "a new code");
			expect(await session.page.locator("#edCodeNote").textContent()).toBe("Loaded “Rôund trip”.");
			expect(await value(session.page, "#edCode")).toBe(roundTrip);
			for (const prefix of ["CUBITZ:", "CUBIST:"])
			{
				await importCode(session, roundTrip.replace("CUBLITZ:", prefix), prefix);
				expect(await value(session.page, "#edCode")).toBe(roundTrip);
			}
			await importCode(session, `  ${roundTrip}  `, "whitespace around a code");
			await importCode(session, JSON.stringify(level), "raw JSON");
			expect(await value(session.page, "#edCode")).toBe(roundTrip);
			for (const bad of ["CUBLITZ:!!!", "not a code", '{"map":[1]}', "null"])
			{
				await importCode(session, bad, `bad code ${bad}`);
				expect(await session.page.locator("#edCodeNote").textContent()).toBe(
					"That code didn’t work. Paste the whole thing, starting with CUBLITZ:",
				);
			}
		},
	);
});

test("one share box shows the code and loads a pasted code or link, checked as strictly as a link", async ({
	browser,
}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openEditor(session);
			await expect(session.page.locator("#editView textarea, #editView input[type=text]")).toHaveCount(2);
			await expect(session.page.locator("#edCode")).toBeEditable();
			await expect(session.page.locator("#edImportText, #edLinkText, #edImportNote")).toHaveCount(0);
			const selection = async () =>
				session.page
					.locator("#edCode")
					.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.value.length]);
			await session.click("#edCode", "click the box");
			const [start, end, length] = await selection();
			expect([start, end]).toStrictEqual([0, length]);
			await session.press("Tab", "tab out of the box");
			await session.press("Shift+Tab", "tab back into the box");
			expect(await selection()).toStrictEqual([0, length, length]);
			const level =
			{
				name: "Linked",
				map: ["S.r.X"],
				k: {},
			};
			await importCode(
				session,
				`https://cublitz.example/?utm_source=chat&${encode(level)}&fbclid=IwAR0abc`,
				"a link",
			);
			expect(await session.page.locator("#edCodeNote").textContent()).toBe("Loaded “Linked”.");
			expect(await value(session.page, "#edCode")).toBe(encode(level));

			const draft = session.last.storage["cubist-editor-draft-v1"];
			for (const [name, bad] of [
				[
					"a code with no start",
					{
						name: "No start",
						map: ["..X"],
						k: {},
					},
				],
				[
					"a code with its own par",
					{
						name: "Has par",
						map: ["S.X"],
						k: {},
						par: 1,
					},
				],
				[
					"a code with no name",
					{
						map: ["S.X"],
						k: {},
					},
				],
			] as const)
			{
				await importCode(session, encode(bad), name);
				expect(await session.page.locator("#edCodeNote").textContent()).toBe(
					"That code didn’t work. Paste the whole thing, starting with CUBLITZ:",
				);
				expect(session.last.storage["cubist-editor-draft-v1"]).toBe(draft);
				expect(await value(session.page, "#edCode")).toBe(encode(bad));
			}

			await session.click(tool("floor"));
			await session.step("type into the box", async (page) => page.locator("#edCode").fill("CUBLITZ:half a co"));
			await session.click(cell(2, 0), "paint while the box holds typing");
			expect(await value(session.page, "#edCode")).toBe("CUBLITZ:half a co");
			await session.click("#edName", "leave the box");
			await session.click(tool("erase"));
			await session.click(cell(3, 0), "erase after leaving the box");
			expect(await value(session.page, "#edCode")).toBe(
				encode(
					{
						name: "Linked",
						map: ["S.. X"],
						k: {},
					},
				),
			);
		},
	);
});

test("save, test play to a win, edit, play from the list, delete", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(1),
		},
		async (session) =>
		{
			await openEditor(session);
			await session.click("#edCheck");
			expect(await session.page.locator("#edResult").textContent()).toBe(
				"Solvable in 7 moves. That becomes the par.",
			);

			await session.click("#edTest");
			expect(session.last.hud).toStrictEqual(
				{
					name: "Untitled",
					num: "Your level",
					moves: "0",
					par: "7",
				},
			);
			await session.click("#editCopy", "edit a copy from play");
			await session.click("#edTest");
			const won = await session.roll("EEEEEEE");
			expect(won.win).toStrictEqual(
				{
					hidden: false,
					title: "Perfect roll",
					score: "7 moves · par 7",
					note: "Your level works. Head back to the editor to tweak or save it.",
					nextHidden: false,
					retryHidden: false,
				},
			);
			await session.click("#winNext", "back to the editor");

			const saved = await session.click("#edSave");
			const id = `L${PINNED_NOW.toString(36)}`;
			expect(JSON.parse(saved.storage["cubist-my-levels-v1"]!)).toStrictEqual([
				{
					id,
					level: UNTITLED,
					saved: PINNED_NOW,
				},
			]);
			expect(await session.page.locator("#edResult").textContent()).toBe(
				"Saved. “Untitled” is in your levels on this browser.",
			);
			expect(await session.page.locator("#edSave").textContent()).toBe("Save changes");

			await session.step("rename", async (page) => page.locator("#edName").fill("Renamed"));
			await session.click("#edSave", "save changes");
			await session.click("#edNew");
			await session.click(`#edList [data-act="edit"]`);
			expect(await value(session.page, "#edName")).toBe("Renamed");
			await session.click(`#edList [data-act="play"]`);
			expect(session.last.hud).toStrictEqual(
				{
					name: "Renamed",
					num: "Your level",
					moves: "0",
					par: "7",
				},
			);
			await session.click("#backEdit");
			await session.click(`#edList [data-act="del"]`, "arm delete");
			const deleted = await session.click(`#edList [data-act="del"]`, "confirm delete");
			expect(deleted.storage["cubist-my-levels-v1"]).toBe("[]");
		},
	);
});

test("built-in levels open as remixes, locked ones are disabled", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(9),
		},
		async (session) =>
		{
			await openEditor(session);
			expect(await session.page.locator("#edStock option:not([disabled])").count()).toBe(11);
			await session.step("open level 10", async (page) => page.locator("#edStock").selectOption("9"));
			expect(await value(session.page, "#edName")).toBe("Box Step remix");
			await session.click("#edCheck");
			expect(await session.page.locator("#edResult").textContent()).toBe(
				"Solvable in 24 moves. That becomes the par.",
			);
			await session.step("open level 1", async (page) => page.locator("#edStock").selectOption("0"));
			await session.click("#edTest");
			await session.click("#modePlay");
		},
	);
});
