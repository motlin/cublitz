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
	{
		name: "The white gates tip says a paint remover takes paint off",
		from: "Paint never comes off, so every puddle",
		to: "Paint stays on until a paint remover wipes it, so every puddle",
	},
	{
		name: "Level 23's tip says nothing on that level takes paint off",
		from: "top bare for the second. Paint never comes off.",
		to: "top bare for the second. Nothing here takes paint off.",
	},
	{
		name: "Infinite levels shuffle the palette with the seeded generator, so a seed gives the same levels in every engine",
		from: "const palette = [...'roygcbp'].sort(() => R() - 0.5).slice(0, tier >= 4 ? 3 : 2);",
		to: "const shuffled = [...'roygcbp'];\n  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }\n  const palette = shuffled.slice(0, tier >= 4 ? 3 : 2);",
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
