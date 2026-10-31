import type {Face, LevelSource, Need, Paint, PieceColor} from "../core/types.ts";

// What the game writes to localStorage. The schemas describe the game's own writes. Reads are not held to
// them: whatever parses is used as it is, exactly as the original did, so a hand-edited value behaves the
// same as it always has. Every access can throw when storage is blocked, and that is caught here.

export const STORAGE_KEYS = {
	progress: "cubist-progress-v2",
	tipsSeen: "cubist-tips-seen-v1",
	draft: "cubist-editor-draft-v1",
	mine: "cubist-my-levels-v1",
	colors: "cubist-colors-v1",
	sound: "cubist-sound-v1",
	infiniteRun: "cublitz-infinite-run-v1",
	infiniteBest: "cublitz-infinite-best-v1",
} as const;

/** Fewest moves per beaten level, by level name. */
export type Progress = Record<string, number>;
export type TipsSeen = Record<string, boolean>;
export type CustomColors = Partial<Record<Paint, string>>;
export type SavedRun = {
	seed: number;
	n: number;
	score: number;
	effs: number[];
	cleared: number;
	streak: number;
	bestStreak: number;
};
export type BestRun = {cleared: number; rating: number; score: number};
type ColoredTool = "paint" | "gate" | "switch" | "button" | "box" | "door";
export type EditorCell =
	| {t: "floor"}
	| {t: "start"}
	| {t: "goal"}
	| {t: "wash"}
	| {t: "wgate"; f: Face}
	| {[T in ColoredTool]: {t: T; c: PieceColor}}[ColoredTool];
export type EditorDraft = {
	id: string | null;
	name: string;
	cols: number;
	rows: number;
	grid: (EditorCell | null)[][];
	need: Need;
};
export type SavedLevel = {id: string; level: LevelSource; saved: number};

const readObject = <T>(key: string): T => {
	try {
		return (JSON.parse(localStorage.getItem(key) || "{}") || {}) as T;
	} catch {
		return {} as T;
	}
};
const loadJSON = <T>(key: string, fallback: T): T => {
	try {
		return (JSON.parse(localStorage.getItem(key)!) || fallback) as T;
	} catch {
		return fallback;
	}
};
const write = (key: string, value: unknown): boolean => {
	try {
		localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
};

const saveJSON = (key: string, value: unknown): void => {
	write(key, value);
};

export const readProgress = (): Progress => readObject(STORAGE_KEYS.progress);
export const writeProgress = (progress: Progress): boolean => write(STORAGE_KEYS.progress, progress);

export const readTipsSeen = (): TipsSeen => readObject(STORAGE_KEYS.tipsSeen);
export const writeTipsSeen = (seen: TipsSeen): boolean => write(STORAGE_KEYS.tipsSeen, seen);
export const clearTipsSeen = (): void => {
	try {
		localStorage.removeItem(STORAGE_KEYS.tipsSeen);
	} catch {
		// Blocked storage has nothing to clear.
	}
};

export const readColors = (): CustomColors => readObject(STORAGE_KEYS.colors);
export const writeColors = (colors: CustomColors): boolean => write(STORAGE_KEYS.colors, colors);

export const readRun = (): SavedRun | null => loadJSON<SavedRun | null>(STORAGE_KEYS.infiniteRun, null);
export const writeRun = (run: SavedRun | null): void => saveJSON(STORAGE_KEYS.infiniteRun, run);
export const readBest = (): BestRun => loadJSON<BestRun>(STORAGE_KEYS.infiniteBest, {cleared: 0, rating: 0, score: 0});
export const writeBest = (best: BestRun): void => saveJSON(STORAGE_KEYS.infiniteBest, best);

export function loadDraft(): EditorDraft | null {
	try {
		const draft = JSON.parse(localStorage.getItem(STORAGE_KEYS.draft)!) as EditorDraft | null;
		if (draft && draft.grid) return draft;
	} catch {
		// An unreadable draft is the same as no draft.
	}
	return null;
}
export const writeDraft = (draft: EditorDraft): boolean => write(STORAGE_KEYS.draft, draft);

export function mine(): SavedLevel[] {
	return loadJSON<SavedLevel[]>(STORAGE_KEYS.mine, []);
}
export function setMine(list: SavedLevel[]): boolean {
	return write(STORAGE_KEYS.mine, list);
}

export const readMuted = (): boolean => {
	try {
		return localStorage.getItem(STORAGE_KEYS.sound) === "off";
	} catch {
		return false;
	}
};
export const writeMuted = (muted: boolean): void => {
	try {
		localStorage.setItem(STORAGE_KEYS.sound, muted ? "off" : "on");
	} catch {
		// The choice just lasts until the page closes.
	}
};
