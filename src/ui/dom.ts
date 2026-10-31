import type {Face, State} from "../core/types.ts";

/** Every element the game looks up by id, with its tag. A jsdom test holds this against index.html. */
export const ELEMENT_TAGS = {
	backEdit: "button",
	board: "div",
	edCheck: "button",
	edClear: "button",
	edCode: "textarea",
	edCodeNote: "span",
	edColors: "div",
	edCols: "b",
	edCopy: "button",
	edFaces: "div",
	edGrid: "div",
	edGridWrap: "div",
	edImport: "button",
	edImportNote: "span",
	edImportText: "textarea",
	edList: "ul",
	edName: "input",
	edNeed: "div",
	edNew: "button",
	edResult: "p",
	edRows: "b",
	edSave: "button",
	edStock: "select",
	edTest: "button",
	edTools: "div",
	editCopy: "button",
	editView: "div",
	hintBox: "div",
	hintBtn: "button",
	hintClose: "button",
	hintMore: "button",
	hintStep: "span",
	hintText: "p",
	infBest: "p",
	infCard: "div",
	infCleared: "div",
	infNew: "button",
	infNote: "p",
	infRank: "b",
	infRating: "span",
	infScore: "div",
	infSkip: "button",
	infStreak: "div",
	levels: "nav",
	lvName: "h2",
	lvNum: "span",
	lvTip: "p",
	modeEdit: "button",
	modePlay: "button",
	moves: "div",
	needBox: "div",
	net: "div",
	ovl: "div",
	palB: "input",
	palBn: "input",
	palBtn: "button",
	palClose: "button",
	palDots: "span",
	palG: "input",
	palGn: "input",
	palHex: "input",
	palName: "b",
	palPick: "input",
	palR: "input",
	palResetAll: "button",
	palResetOne: "button",
	palRn: "input",
	palSwatches: "div",
	palette: "div",
	par: "div",
	playView: "div",
	resetBtn: "button",
	resetNote: "p",
	resetProgress: "button",
	solAll: "button",
	solBox: "div",
	solBtn: "button",
	solGoal: "button",
	solHide: "button",
	solNext: "button",
	solText: "p",
	status: "div",
	tip: "div",
	tipArt: "div",
	tipBody: "p",
	tipCount: "span",
	tipOk: "button",
	tipTitle: "h3",
	tipsReplay: "button",
	titleEdit: "button",
	titleInf: "button",
	titlePlay: "button",
	titleProgress: "p",
	titleView: "section",
	topbar: "header",
	undoBtn: "button",
	viewport: "div",
	win: "div",
	winNext: "button",
	winNote: "p",
	winRetry: "button",
	winScore: "p",
	winTitle: "h3",
} as const;

export type ElementId = keyof typeof ELEMENT_TAGS;
export type ElementById<K extends ElementId> = HTMLElementTagNameMap[(typeof ELEMENT_TAGS)[K]];

export const $ = <K extends ElementId>(id: K): ElementById<K> => document.getElementById(id) as ElementById<K>;

/** The select for one face's target color. The editor builds these at startup. */
export const needSelect = (f: Face): HTMLSelectElement => document.getElementById("need-" + f) as HTMLSelectElement;

/**
 * Hands a value to a DOM property or method as it is, for the browser to convert. The original relies on
 * that conversion, and a value out of localStorage can be undefined, which textContent shows as empty but
 * String() would spell out.
 */
export const domValue = (value: unknown): string => value as string;

/** The element a bubbling click or pointer event started on. */
export const targetElement = (e: Event): Element => e.target as Element;
export const targetInput = (e: Event): HTMLInputElement => e.target as HTMLInputElement;
export const targetSelect = (e: Event): HTMLSelectElement => e.target as HTMLSelectElement;

export type HotData = {lvl?: number; st?: State; hist?: State[]; mode?: string};
declare global {
	/** The two extras the game looks for: claude.ai's hot-reload hooks and Safari's old audio name. */
	interface Window {
		claude?: {hot?: {snapshot?: (take: () => HotData) => void; ready?: (start: (data?: HotData) => void) => void; data?: HotData}};
		webkitAudioContext?: typeof AudioContext;
	}
}
