import {readFileSync} from "node:fs";
import {expect, test} from "vite-plus/test";
import {inlineStylesheets, plainRegionComments} from "../../../scripts/single-file-page.ts";

const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("each stylesheet goes back into the page as a style element, with the same bytes", () =>
{
	const page = inlineStylesheets(read("index.html"), read);
	expect(page.includes(`<style>${read("src/styles/reset.css").trimEnd()}</style>`)).toBe(true);
	expect(page.includes(`<style>\n${read("src/styles/game.css")}</style>`)).toBe(true);
	expect(page.includes('<link rel="stylesheet" href="/src/styles/')).toBe(false);
});

test("the bundler's region comments become the plain path comments the page has always shipped", () =>
{
	const chunk = [
		"var FIRST = 1;",
		"//#region src/core/cube.ts",
		"var cube = '//#region stays inside a line';",
		"//#endregion",
		"//#region src/main.ts",
		"start();",
		"//#endregion",
		"",
	].join("\n");
	expect(plainRegionComments(chunk)).toBe(
		[
			"var FIRST = 1;",
			"// src/core/cube.ts",
			"var cube = '//#region stays inside a line';",
			"// src/main.ts",
			"start();",
			"",
		].join("\n"),
	);
});

test("the page source keeps its CSS only in the stylesheets", () =>
{
	expect(read("index.html").includes("<style")).toBe(false);
});

test("a page that lost a stylesheet tag is refused", () =>
{
	expect(() => inlineStylesheets("<html></html>", read)).toThrow(
		'<link rel="stylesheet" href="/src/styles/reset.css"> must occur exactly once',
	);
});
