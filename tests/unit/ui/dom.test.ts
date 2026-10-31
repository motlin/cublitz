// @vitest-environment jsdom
import {readFileSync} from "node:fs";
import {beforeAll, expect, test} from "vite-plus/test";
import {$, domValue, ELEMENT_TAGS, type ElementId} from "../../../src/ui/dom.ts";

beforeAll(() => {
	document.documentElement.innerHTML = readFileSync("index.html", "utf8");
});

test("every id the game looks up is in the markup with the tag its type promises", () => {
	const found = Object.fromEntries(
		Object.keys(ELEMENT_TAGS).map((id) => [id, $(id as ElementId).tagName.toLowerCase()]),
	);
	expect(found).toStrictEqual(ELEMENT_TAGS);
});

test("values reach the DOM unconverted, so undefined still shows as empty", () => {
	const el = $("moves");
	el.textContent = domValue(undefined);
	expect(el.textContent).toBe("");
	el.textContent = domValue(7);
	expect(el.textContent).toBe("7");
});
