import {expect, type Page, test} from "@playwright/test";
import {atLevel, type Pair, PINNED_NOW, withPair} from "./harness/pair.ts";

const cell = (x: number, y: number) => `#edGrid [data-x="${x}"][data-y="${y}"]`;
const tool = (name: string) => `#edTools [data-tool="${name}"]`;
const color = (name: string) => `#edColors [data-color="${name}"]`;
const value = (page: Page, selector: string) => page.locator(selector).inputValue();
const encode = (level: unknown) => `CUBLITZ:${Buffer.from(JSON.stringify(level)).toString("base64")}`;
const UNTITLED = {name: "Untitled", map: ["........", "........", "S......X", "........", "........"], k: {}};

const openEditor = (pair: Pair) => pair.click("#titleEdit");
const importCode = async (pair: Pair, code: string, name: string) => {
	await pair.step(`type ${name}`, (page) => page.locator("#edImportText").fill(code));
	return pair.click("#edImport", `import ${name}`);
};

test("every tile tool, color and white gate face", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await openEditor(pair);
		const tools = ["paint", "gate", "switch", "button", "box", "door"];
		for (const [x, name] of tools.entries()) {
			await pair.click(tool(name));
			await pair.click(cell(x + 1, 0), `place ${name}`);
		}
		for (const [x, name] of ["r", "o", "y", "g", "c", "b", "p"].entries()) {
			await pair.click(color(name));
			await pair.click(cell(x, 1), `place color ${name}`);
		}
		await pair.click(tool("door"));
		await pair.click(color("w"));
		await pair.click(cell(0, 3), "white door");
		await pair.click(tool("paint"), "paint refuses white and falls back to red");
		await pair.click(tool("wgate"));
		for (const [x, face] of ["b", "t", "n", "s", "e", "w"].entries()) {
			await pair.click(`#edFaces [data-face="${face}"]`);
			await pair.click(cell(x + 1, 3), `white gate ${face}`);
		}
		for (const [name, x, y] of [["wash", 1, 4], ["floor", 2, 4], ["erase", 3, 4], ["goal", 4, 4], ["start", 5, 4]] as const) {
			await pair.click(tool(name));
			await pair.click(cell(x, y), `place ${name}`);
		}
		const expected = JSON.parse(pair.last.storage["cubist-editor-draft-v1"] as string) as {grid: unknown[][]};
		expect(expected.grid[3]?.[1]).toStrictEqual({t: "wgate", f: "b"});
		expect(expected.grid[0]?.[6]).toStrictEqual({t: "door", c: "r"});
		await pair.reload();
		await pair.click("#titleEdit", "draft survives a reload");
	});
});

test("drag painting, resizing to the limits, name and target needs", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await openEditor(pair);
		await pair.click(tool("erase"));
		await pair.step("drag across a row", async (page) => {
			const box = async (x: number) => (await page.locator(cell(x, 1)).boundingBox()) as {x: number; y: number; width: number; height: number};
			const start = await box(1);
			await page.mouse.move(start.x + 5, start.y + 5);
			await page.mouse.down();
			for (const x of [2, 3, 4]) {
				const b = await box(x);
				await page.mouse.move(b.x + 5, b.y + 5);
			}
			await page.mouse.up();
		});
		const dragged = JSON.parse(pair.last.storage["cubist-editor-draft-v1"] as string) as {grid: unknown[][]};
		expect(dragged.grid[1]?.slice(0, 6)).toStrictEqual([{t: "floor"}, null, null, null, null, {t: "floor"}]);
		for (let i = 0; i < 11; i++) await pair.click('[data-resize="1,0"]', `more columns ${i}`);
		for (let i = 0; i < 8; i++) await pair.click('[data-resize="0,1"]', `more rows ${i}`);
		expect(await pair.legacy.locator("#edCols").textContent()).toBe("18");
		expect(await pair.legacy.locator("#edRows").textContent()).toBe("12");
		for (let i = 0; i < 16; i++) await pair.click('[data-resize="-1,0"]', `fewer columns ${i}`);
		for (let i = 0; i < 10; i++) await pair.click('[data-resize="0,-1"]', `fewer rows ${i}`);
		expect(await pair.legacy.locator("#edCols").textContent()).toBe("3");
		expect(await pair.legacy.locator("#edRows").textContent()).toBe("3");
		await pair.click("#edNew");
		await pair.step("rename", (page) => page.locator("#edName").fill("My <level> & co"));
		for (const face of ["t", "b", "n", "s", "e", "w"]) {
			await pair.step(`need ${face}`, (page) => page.locator(`#need-${face}`).selectOption("g"));
		}
		await pair.step("clear one need", (page) => page.locator("#need-b").selectOption(""));
		await pair.click("#edCheck", "unsolvable level");
		expect(await pair.legacy.locator("#edResult").textContent()).toBe("No solution. No sequence of rolls reaches a target that satisfies its needs.");
	});
});

test("errors: no start, no target, two tries at save, test and check", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await openEditor(pair);
		await pair.click("#edClear");
		expect(await value(pair.legacy, "#edCode")).toBe("");
		expect(await pair.legacy.locator("#edCodeNote").textContent()).toBe("Place a start tile.");
		for (const id of ["#edCheck", "#edTest", "#edSave"]) await pair.click(id, `${id} without a start`);
		await pair.click(tool("start"));
		await pair.click(cell(0, 0));
		expect(await pair.legacy.locator("#edCodeNote").textContent()).toBe("Place at least one target.");
		for (const id of ["#edCheck", "#edTest", "#edSave"]) await pair.click(id, `${id} without a target`);
		await pair.click("#edCopy", "copy with no code does nothing");
	});
});

test("share code round trip, older prefixes, raw JSON and bad codes", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await openEditor(pair);
		const code = await value(pair.legacy, "#edCode");
		expect(code).toBe(encode(UNTITLED));
		await pair.click("#edCopy");
		expect(await pair.legacy.locator("#edCodeNote").textContent()).toBe("Copied.");
		await pair.step("read the clipboard", (page) => page.evaluate(() => navigator.clipboard.readText()));

		const level = {name: "Rôund trip", map: ["Sr.R.X", "..1.2."], k: {"1": ["switch", "r"], "2": ["door", "r"]}, need: {t: "r"}};
		const roundTrip = encode(level).replace(/^CUBLITZ:.*/, `CUBLITZ:${btoa(unescape(encodeURIComponent(JSON.stringify(level))))}`);
		await importCode(pair, roundTrip, "a new code");
		expect(await pair.legacy.locator("#edImportNote").textContent()).toBe("Loaded “Rôund trip”.");
		expect(await value(pair.legacy, "#edCode")).toBe(roundTrip);
		for (const prefix of ["CUBITZ:", "CUBIST:"]) {
			await importCode(pair, roundTrip.replace("CUBLITZ:", prefix), prefix);
			expect(await value(pair.legacy, "#edCode")).toBe(roundTrip);
		}
		await importCode(pair, `  ${roundTrip}  `, "whitespace around a code");
		await importCode(pair, JSON.stringify(level), "raw JSON");
		expect(await value(pair.legacy, "#edCode")).toBe(roundTrip);
		for (const bad of ["CUBLITZ:!!!", "not a code", '{"map":[1]}', "null"]) {
			await importCode(pair, bad, `bad code ${bad}`);
			expect(await pair.legacy.locator("#edImportNote").textContent()).toBe("That code didn’t work. Paste the whole thing, starting with CUBLITZ:");
		}
	});
});

test("save, test play to a win, edit, play from the list, delete", async ({browser}) => {
	await withPair(browser, {storage: atLevel(1)}, async (pair) => {
		await openEditor(pair);
		await pair.click("#edCheck");
		expect(await pair.legacy.locator("#edResult").textContent()).toBe("Solvable in 7 moves. That becomes the par.");

		await pair.click("#edTest");
		expect(pair.last.hud).toStrictEqual({name: "Untitled", num: "Your level", moves: "0", par: "7"});
		await pair.click("#editCopy", "edit a copy from play");
		await pair.click("#edTest");
		const won = await pair.roll("EEEEEEE");
		expect(won.win).toStrictEqual({
			hidden: false,
			title: "Perfect roll",
			score: "7 moves · par 7",
			note: "Your level works. Head back to the editor to tweak or save it.",
			nextHidden: false,
			retryHidden: false,
		});
		await pair.click("#winNext", "back to the editor");

		const saved = await pair.click("#edSave");
		const id = `L${PINNED_NOW.toString(36)}`;
		expect(JSON.parse(saved.storage["cubist-my-levels-v1"] as string)).toStrictEqual([{id, level: UNTITLED, saved: PINNED_NOW}]);
		expect(await pair.legacy.locator("#edResult").textContent()).toBe("Saved. “Untitled” is in your levels on this browser.");
		expect(await pair.legacy.locator("#edSave").textContent()).toBe("Save changes");

		await pair.step("rename", (page) => page.locator("#edName").fill("Renamed"));
		await pair.click("#edSave", "save changes");
		await pair.click("#edNew");
		await pair.click(`#edList [data-act="edit"]`);
		expect(await value(pair.legacy, "#edName")).toBe("Renamed");
		await pair.click(`#edList [data-act="play"]`);
		expect(pair.last.hud).toStrictEqual({name: "Renamed", num: "Your level", moves: "0", par: "7"});
		await pair.click("#backEdit");
		await pair.click(`#edList [data-act="del"]`, "arm delete");
		const deleted = await pair.click(`#edList [data-act="del"]`, "confirm delete");
		expect(deleted.storage["cubist-my-levels-v1"]).toBe("[]");
	});
});

test("built-in levels open as remixes, locked ones are disabled", async ({browser}) => {
	await withPair(browser, {storage: atLevel(9)}, async (pair) => {
		await openEditor(pair);
		expect(await pair.legacy.locator("#edStock option:not([disabled])").count()).toBe(11);
		await pair.step("open level 10", (page) => page.locator("#edStock").selectOption("9"));
		expect(await value(pair.legacy, "#edName")).toBe("Box Step remix");
		await pair.click("#edCheck");
		expect(await pair.legacy.locator("#edResult").textContent()).toBe("Solvable in 24 moves. That becomes the par.");
		await pair.step("open level 1", (page) => page.locator("#edStock").selectOption("0"));
		await pair.click("#edTest");
		await pair.click("#modePlay");
	});
});
