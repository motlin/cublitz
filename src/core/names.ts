import type {Direction, Face, PieceColor} from "./types.ts";

export const CNAME: Record<PieceColor, string> = {
	r: "red",
	o: "orange",
	y: "yellow",
	g: "green",
	c: "cyan",
	b: "blue",
	p: "purple",
	w: "white",
};
export const howWork = (c: PieceColor): string => (c === "w" ? "completely bare" : `solid ${CNAME[c]}`);
export const FNAME: Record<Face, string> = {t: "top", b: "bottom", n: "north", s: "south", e: "east", w: "west"};
export const wgateName = (f: Face): string => (f === "b" ? "white gate" : `${FNAME[f]} white gate`);
export const dirWord = (d: Direction): string => ({N: "north", S: "south", E: "east", W: "west"})[d];
export const list = (a: string[]): string =>
	a.length <= 1 ? a[0] || "" : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
