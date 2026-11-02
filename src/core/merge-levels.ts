import {parseLevel} from "./level.ts";
import type {Level, LevelSource} from "./types.ts";

// Levels for merging cubes, kept apart from LEVELS, which has to match the original's campaign with the intentional
// divergences applied.
const SOURCES: LevelSource[] = [
	{
		name: "Stick Together",
		tip: "Press right into the other cube to merge with it. Press right again and the whole block tips up.",
		par: 4,
		k: {"+": ["cube", "w"]},
		map: ["S+...X"],
	},
	{
		name: "Mind the Gap",
		tip: "Two cubes won't reach. A block of three can lie across a one-cell gap, held up by both ends.",
		par: 5,
		k: {"+": ["cube", "w"]},
		map: ["S++.. .X"],
	},
	{
		name: "Side by Side",
		tip: "Each cube in a block has its own faces. Both puddles paint at once, and both gates want their own cube red.",
		par: 9,
		k: {"+": ["cube", "w"]},
		map: ["S+...", "   rr", "   ..", "   ..", "   ..", "   RR", "   X."],
	},
];

export const MERGE_LEVELS: Level[] = SOURCES.map((L) => parseLevel(L));
