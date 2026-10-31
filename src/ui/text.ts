import type {PieceColor} from "../core/types.ts";

export const COLORS: Record<PieceColor, string> = {
	r: "var(--red)",
	o: "var(--orange)",
	y: "var(--yellow)",
	g: "var(--green)",
	c: "var(--cyan)",
	b: "var(--blue)",
	p: "var(--purple)",
	w: "var(--clay)",
};
export const GLYPH: Record<PieceColor, string> = {r: "▲", o: "✚", y: "●", g: "◆", c: "▼", b: "■", p: "★", w: "○"};
export const WGLYPH: Record<string, string> = {b: "", t: "◉", n: "↑", s: "↓", e: "→", w: "←"};

export const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
const ESCAPES: Record<string, string> = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"};
export const esc = (s: unknown): string => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]!);
