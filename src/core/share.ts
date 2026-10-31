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
