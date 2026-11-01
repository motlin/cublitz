import {CNAME} from "../core/names.ts";
import type {Paint} from "../core/types.ts";
import {$, domValue, targetElement, targetInput} from "./dom.ts";
import {type CustomColors, readColors, writeColors} from "./storage.ts";
import {cap, COLORS, GLYPH} from "./text.ts";

// Paint colors
const VAR: Record<Paint, string> = {
	r: "--red",
	o: "--orange",
	y: "--yellow",
	g: "--green",
	c: "--cyan",
	b: "--blue",
	p: "--purple",
};
const PALETTE_PAINTS = Object.keys(VAR) as Paint[];
const DEFAULT_HEX: Partial<Record<Paint, string>> = {};
let custom: CustomColors = {};
let palSel: Paint = "r";

const hexOf = (k: Paint): string => custom[k] || DEFAULT_HEX[k]!;
export const toRGB = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const toHex = (rgb: number[]): string =>
	"#" +
	rgb
		.map((v) =>
			Math.max(0, Math.min(255, Math.round(v)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("");

function applyColors(): void {
	for (const k of PALETTE_PAINTS) {
		if (custom[k]) document.documentElement.style.setProperty(VAR[k], custom[k]);
		else document.documentElement.style.removeProperty(VAR[k]);
	}
	$("palDots").innerHTML = PALETTE_PAINTS.map((k) => `<i style="background:${COLORS[k]}"></i>`).join("");
}
function saveColors(): void {
	writeColors(custom);
}
function setColor(k: Paint, hex: string): void {
	hex = hex.toLowerCase();
	if (hex === DEFAULT_HEX[k]) Reflect.deleteProperty(custom, k);
	else custom[k] = hex;
	applyColors();
	saveColors();
	renderPalette(true);
}
function renderPalette(keepFocus?: boolean): void {
	$("palSwatches").innerHTML = PALETTE_PAINTS.map(
		(k) =>
			`<button type="button" data-k="${k}" aria-pressed="${k === palSel}" aria-label="${CNAME[k]}" class="${custom[k] ? "changed" : ""}" style="--pc:${COLORS[k]}">${GLYPH[k]}</button>`,
	).join("");
	const hex = hexOf(palSel),
		[r, g, b] = toRGB(hex);
	$("palette").style.setProperty("--pc", COLORS[palSel]);
	$("palName").textContent = cap(CNAME[palSel]);
	const set = (
		id: "palPick" | "palHex" | "palR" | "palG" | "palB" | "palRn" | "palGn" | "palBn",
		v: string | number | undefined,
	) => {
		const el = $(id);
		if (!keepFocus || document.activeElement !== el) el.value = domValue(v);
	};
	set("palPick", hex);
	set("palHex", hex);
	set("palR", r);
	set("palG", g);
	set("palB", b);
	set("palRn", r);
	set("palGn", g);
	set("palBn", b);
	$("palResetOne").disabled = !custom[palSel];
	$("palResetAll").disabled = !Object.keys(custom).length;
}
export function openPalette(open: boolean | string): void {
	$("palette").hidden = !open;
	$("palBtn").setAttribute("aria-expanded", domValue(open));
	if (open) renderPalette();
}
const channel = (id: "palR" | "palG" | "palB" | "palRn" | "palGn" | "palBn"): number => Number($(id).value) || 0;
const fromChannels = (src: "r" | "n"): void => {
	const rgb =
		src === "n"
			? [channel("palRn"), channel("palGn"), channel("palBn")]
			: [channel("palR"), channel("palG"), channel("palB")];
	setColor(palSel, toHex(rgb));
};

let rootCS: CSSStyleDeclaration;
export function initPalette(): void {
	rootCS = getComputedStyle(document.documentElement);
	for (const k of PALETTE_PAINTS) DEFAULT_HEX[k] = rootCS.getPropertyValue(VAR[k]).trim().toLowerCase();
	custom = readColors();
	$("palBtn").addEventListener("click", () => {
		openPalette($("palette").hidden);
	});
	$("palClose").addEventListener("click", () => {
		openPalette(false);
		$("palBtn").focus({preventScroll: true});
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !$("palette").hidden) {
			openPalette(false);
			$("palBtn").focus({preventScroll: true});
		}
	});
	document.addEventListener("pointerdown", (e) => {
		if (!$("palette").hidden && !targetElement(e).closest("#palette, #palBtn")) openPalette(false);
	});
	$("palSwatches").addEventListener("click", (e) => {
		const b = targetElement(e).closest("button");
		if (b) {
			palSel = b.dataset["k"] as Paint;
			renderPalette();
		}
	});
	$("palPick").addEventListener("input", (e) => {
		setColor(palSel, targetInput(e).value);
	});
	(["palR", "palG", "palB"] as const).forEach((id) => {
		$(id).addEventListener("input", () => {
			fromChannels("r");
		});
	});
	(["palRn", "palGn", "palBn"] as const).forEach((id) => {
		$(id).addEventListener("input", () => {
			fromChannels("n");
		});
	});
	$("palHex").addEventListener("input", (e) => {
		let v = targetInput(e).value.trim();
		if (!v.startsWith("#")) v = "#" + v;
		if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(palSel, v);
	});
	$("palHex").addEventListener("blur", () => {
		renderPalette();
	});
	$("palResetOne").addEventListener("click", () => {
		Reflect.deleteProperty(custom, palSel);
		applyColors();
		saveColors();
		renderPalette();
	});
	$("palResetAll").addEventListener("click", () => {
		custom = {};
		applyColors();
		saveColors();
		renderPalette();
	});
	applyColors();
}
