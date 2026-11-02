import {readFileSync} from "node:fs";
import {describe, expect, it} from "vite-plus/test";
import {
	INTENTIONAL_DIVERGENCES,
	readExpectedHtml,
	readOriginalHtml,
	withIntentionalDivergences,
} from "../support/intentional-divergences.ts";

const SCRIPT_BODY = /(?<=<script>\n)[\s\S]*(?=<\/script>)/;

const withoutScript = (html: string) => html.replace(SCRIPT_BODY, "");

describe("the intentional divergences", () => {
	it("are exactly the approved changes", () => {
		expect(INTENTIONAL_DIVERGENCES.map(({name}) => name)).toStrictEqual([
			"Skip canvas is disabled on the infinite win card",
			"The white gates tip says a paint remover takes paint off",
			"Level 23's tip says nothing on that level takes paint off",
			"Infinite levels shuffle the palette with the seeded generator, so a seed gives the same levels in every engine",
			"The level bar links to the merge levels after the campaign",
			"The editor's tool bar has a Loose cube tool",
			"On a phone-sized touch screen, play is one fixed screen that fits the level, and touch gestures go by finger count",
			"The editor has a Copy link button beside Copy code",
			"The page can be installed as an app that plays offline",
		]);
	});

	it("are all listed in the README", () => {
		const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
		const listed = /## Intentional divergences\n\n[^\n]*\n\n((?:- .*\n)+)/.exec(readme)?.[1] ?? "";
		expect(listed.trimEnd().split("\n")).toStrictEqual(INTENTIONAL_DIVERGENCES.map(({name}) => `- ${name}`));
	});

	it("edit only the original's script", () => {
		expect(withoutScript(readExpectedHtml())).toBe(withoutScript(readOriginalHtml()));
		expect(readExpectedHtml() === readOriginalHtml()).toBe(false);
	});

	it("turn the original into the expected page and nothing else", () => {
		const undone = INTENTIONAL_DIVERGENCES.reduceRight(
			(page, {from, to}) => page.replace(to, () => from),
			readExpectedHtml(),
		);
		expect(undone === readOriginalHtml()).toBe(true);
	});

	it("refuse a page where an edit does not match exactly once", () => {
		const [first] = INTENTIONAL_DIVERGENCES;
		const expected = `"${first?.name}" must match the original exactly once`;
		expect(() => withIntentionalDivergences("no such text")).toThrow(expected);
		expect(() => withIntentionalDivergences(`${first?.from}${first?.from}`)).toThrow(expected);
	});
});
