import {LEVELS} from "../core/levels.ts";
import type {Level, State} from "../core/types.ts";
import {type Progress, readProgress, writeProgress} from "./storage.ts";

/** The level being played. lvl is -1 for a level from the editor, -2 in infinite mode and -3 for a level from a shared link. */
export type Session = {
	lvl: number;
	L: Level;
	st: State;
	hist: State[];
	busy: boolean;
	won: boolean;
	rolls: number;
	usedSolution?: boolean;
};

/** Null only until the page has booted, which is why a few callers still check it. */
export let S: Session = null as unknown as Session;
export const setSession = (session: Session): void => {
	S = session;
};

export let progress: Progress = {};
export const loadProgress = (): void => {
	progress = readProgress();
};
export function saveProgress(): void {
	writeProgress(progress);
}
export const eraseProgress = (): void => {
	progress = {};
	saveProgress();
};
export const beaten = (L: {name?: string}): number | undefined => progress[L.name!];
export const unlocked = (i: number): boolean => i === 0 || !!beaten(LEVELS[i - 1]!) || !!beaten(LEVELS[i]!);

export let reduced = false;
export const loadReducedMotion = (): void => {
	reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
};
