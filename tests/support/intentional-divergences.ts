import {readFileSync} from "node:fs";

// The owner's approved changes from legacy/original.html, and the only differences the differential tests allow.
// Each is an exact edit to the original's text, so everything else about the expected page stays the original.
export type IntentionalDivergence = {name: string; from: string; to: string};

export const INTENTIONAL_DIVERGENCES: IntentionalDivergence[] = [
	{
		name: "Skip canvas is disabled on the infinite win card",
		from: "  if (!on || !run) return;\n  const rating = infRating();",
		to: "  if (!on || !run) return;\n  $('infSkip').disabled = S.won;\n  const rating = infRating();",
	},
];

export function withIntentionalDivergences(html: string): string {
	return INTENTIONAL_DIVERGENCES.reduce((page, {name, from, to}) => {
		if (page.split(from).length !== 2) throw new Error(`"${name}" must match the original exactly once`);
		return page.replace(from, () => to);
	}, html);
}

export const readOriginalHtml = (): string =>
	readFileSync(new URL("../../legacy/original.html", import.meta.url), "utf8");

export const readExpectedHtml = (): string => withIntentionalDivergences(readOriginalHtml());
