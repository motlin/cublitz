import type {Direction, Face, FaceColor, Faces, PieceColor} from "./types.ts";

export const FACES: Face[] = ["t", "b", "n", "s", "e", "w"];
export const DIRS: Record<Direction, [number, number]> = {N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0]};

export function roll(f: Faces, d: Direction): Faces {
	const {t, b, n, s, e, w} = f;
	if (d === "E") return {t: w, e: t, b: e, w: b, n, s};
	if (d === "W") return {t: e, w: t, b: w, e: b, n, s};
	if (d === "N") return {n: t, b: n, s: b, t: s, e, w};
	return {s: t, b: s, n: b, t: n, e, w};
}

export const blank = (): Faces => ({t: "", b: "", n: "", s: "", e: "", w: ""});

export function solidColor(f: Faces): FaceColor {
	const c = f.t;
	return c && FACES.every((k) => f[k] === c) ? c : "";
}

// The color the cube can work pieces of: its solid color, or white ('w') when every face is bare
export function workColor(f: Faces): PieceColor | "" {
	return solidColor(f) || (FACES.every((k) => !f[k]) ? "w" : "");
}
