import {readFileSync} from "node:fs";
import {expect, test} from "vite-plus/test";
import {inlineStylesheets, plainRegionComments} from "../../../scripts/single-file-page.ts";

const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const withoutScript = (html: string): string => html.replace(/<script\b[\s\S]*<\/script>/, "<script>");

test("the stylesheets put the page back to the original, byte for byte outside the script", () =>
{
	expect(withoutScript(inlineStylesheets(read("index.html"), read))).toBe(
		withoutScript(read("legacy/original.html")),
	);
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
