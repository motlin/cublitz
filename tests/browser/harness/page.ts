import {LEVELS} from "../../../src/core/levels.ts";

export const BASE_URL = `http://127.0.0.1:${process.env["CUBLITZ_PORT"] ?? "4817"}`;
export const DIST_PATH = "/";
export const DESKTOP =
{
	width: 1280,
	height: 800,
};
export const MOBILE =
{
	width: 390,
	height: 844,
};
export const PINNED_NOW = Date.UTC(2026, 0, 2, 3, 4, 5);

const LEVEL_NAMES = LEVELS.map((level) => level.name ?? "");

/** localStorage that opens level `index` from the title's Play button, with the tutorial already seen. */
export function atLevel(index: number, tipsSeen = true): Record<string, string>
{
	const beaten = Object.fromEntries(LEVEL_NAMES.slice(0, index).map((name) => [name, 99]));
	const tips = Object.fromEntries(
		["roll", "paint", "gate", "need", "switch", "button", "wgate", "wash", "white"].map((key) => [key, true]),
	);
	return {
		"cubist-progress-v2": JSON.stringify(beaten),
		...(tipsSeen
			?
				{
					"cubist-tips-seen-v1": JSON.stringify(tips),
				}
			: {}),
	};
}
