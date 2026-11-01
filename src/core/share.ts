import {FACES} from "./cube.ts";
import {PAINTS} from "./level.ts";
import type {LevelSource} from "./types.ts";

export const encodeLevel = (L: LevelSource): string =>
	"CUBLITZ:" + btoa(unescape(encodeURIComponent(JSON.stringify(L))));

/** Reads a share code or raw JSON. Only `map` is checked: the rest of the level is taken on trust. */
export function decodeLevel(s: string): LevelSource {
	s = s.trim();
	let json = s;
	const pre = ["CUBLITZ:", "CUBITZ:", "CUBIST:"].find((p) => s.startsWith(p));
	if (pre) json = decodeURIComponent(escape(atob(s.slice(pre.length).replace(/\s+/g, ""))));
	const L = JSON.parse(json) as {map?: unknown} | null;
	if (!L || !Array.isArray(L.map) || !L.map.every((r) => typeof r === "string")) throw new Error("bad");
	return L as LevelSource;
}

const LEVEL_KEYS = new Set(["name", "map", "k", "need"]);
const LEGEND_COLORS = PAINTS + "w";
const COLORED_KINDS = new Set(["box", "switch", "button", "door"]);
const MAP_CHARS = ` .SXWZ${PAINTS}${PAINTS.toUpperCase()}`;
const UNSHADOWABLE = " SX"; // a legend entry outranks any other map character, as Clean Sweep's a, b and c do
const MAX_NAME = 100;
const MAX_COLS = 18; // the largest grid the editor can make
const MAX_ROWS = 12;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const isOneOf = (value: unknown, letters: readonly string[] | string): boolean =>
	typeof value === "string" && value.length === 1 && letters.includes(value);

function validLegendEntry(entry: unknown): boolean {
	if (!Array.isArray(entry) || entry.length !== 2) return false;
	const [kind, param] = entry as unknown[];
	if (kind === "wgate") return isOneOf(param, FACES);
	if (kind === "cube") return param === "w";
	return COLORED_KINDS.has(kind as string) && isOneOf(param, LEGEND_COLORS);
}

function validSharedLevel(L: Record<string, unknown>): boolean {
	const {name, map, k = {}, need = {}} = L;
	if (!Object.keys(L).every((key) => LEVEL_KEYS.has(key))) return false;
	if (typeof name !== "string" || !name.trim() || name.length > MAX_NAME) return false;
	if (!isRecord(k) || !isRecord(need)) return false;
	const legend = Object.entries(k);
	if (
		!legend.every(
			([ch, entry]) => Array.from(ch).length === 1 && !UNSHADOWABLE.includes(ch) && validLegendEntry(entry),
		)
	)
		return false;
	if (!Object.entries(need).every(([face, paint]) => isOneOf(face, FACES) && isOneOf(paint, PAINTS))) return false;
	const rows = map as string[];
	if (rows.length > MAX_ROWS) return false;
	const cells = rows.flatMap((row) => Array.from(row));
	if (rows.some((row) => Array.from(row).length > MAX_COLS)) return false;
	if (!cells.every((ch) => MAP_CHARS.includes(ch) || Object.hasOwn(k, ch))) return false;
	return cells.filter((ch) => ch === "S").length === 1 && cells.includes("X");
}

/**
 * The level in a link's raw query, or null when the query holds no share code. Read location.search itself, because
 * query parsing turns the code's + into a space. Other parameters are ignored, because social sites add their own. A
 * link comes from anyone, so unlike decodeLevel this checks all of it.
 */
export function levelFromSearch(search: string): LevelSource | null {
	const prefix = "CUBLITZ:";
	const code = search
		.slice(1)
		.split("&")
		.find((parameter) => parameter.startsWith(prefix));
	if (code === undefined) return null;
	const level = decodeLevel(prefix + decodeURIComponent(code.slice(prefix.length)));
	if (!validSharedLevel(level)) throw new Error("bad");
	return level;
}
