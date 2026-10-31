import {FACES, solidColor} from "../core/cube.ts";
import {LEVELS} from "../core/levels.ts";
import {MERGE_LEVELS} from "../core/merge-levels.ts";
import {solidColorOf} from "../core/prism.ts";
import {CNAME, FNAME} from "../core/names.ts";
import type {Face, Need, Paint} from "../core/types.ts";
import {$, domValue} from "./dom.ts";
import {renderStock} from "./editor.ts";
import {loadLevel, loadMergeLevel, mergeIndex} from "./play.ts";
import {beaten, S, unlocked} from "./session.ts";
import {COLORS} from "./text.ts";

const NET_POS: Record<Face, [number, number]> = {n: [2, 1], w: [1, 2], t: [2, 2], e: [3, 2], s: [2, 3], b: [2, 4]};

const MERGE_BUTTON =
	"font-family:var(--font-mono);font-weight:700;font-size:13px;width:36px;height:32px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--muted);cursor:pointer;";

export function renderHud(popFace?: Face | null): void {
	const L = S.L,
		need: Need = L.need || {},
		f = S.st.f;
	const net = $("net");
	net.innerHTML = "";
	for (const k of FACES) {
		const d = document.createElement("div");
		d.className = "nf";
		d.style.gridColumn = domValue(NET_POS[k][0]);
		d.style.gridRow = domValue(NET_POS[k][1]);
		const has = f[k];
		d.style.setProperty("--fc", has ? COLORS[has] : "var(--clay)");
		d.textContent = k.toUpperCase();
		d.title = FNAME[k] + (has ? ": " + CNAME[has] : ": bare");
		const wants = need[k];
		if (wants) {
			d.classList.add("need");
			d.style.setProperty("--nc", COLORS[wants]);
			if (has === wants) d.classList.add("met");
		}
		if (k === popFace) d.classList.add("pop");
		net.appendChild(d);
	}
	const units = S.st.units;
	if (units && units.length > 1) {
		const solid = solidColorOf(S.st);
		$("needBox").innerHTML =
			`<div class="solidline"><b>Block of ${units.length} cubes</b>${solid ? `. Solid ${CNAME[solid]}` : ""}.</div>` +
			units
				.map((u, i) => {
					const painted = FACES.filter((k) => u.f[k]).map((k) => `${CNAME[u.f[k] as Paint]} on ${FNAME[k]}`);
					return `<div>Cube ${i + 1}: ${painted.join(", ") || "bare"}.</div>`;
				})
				.join("") +
			(Object.entries(need) as [Face, Paint][])
				.map(([k, v]) => `<div class="needline">The target needs ${CNAME[v]} on ${FNAME[k]}.</div>`)
				.join("");
		$("moves").textContent = domValue(S.hist.length);
		$("moves").nextElementSibling!.textContent = "moves";
		$("undoBtn").disabled = !S.hist.length;
		return;
	}
	const solid = solidColor(f);
	const counts: Partial<Record<Paint, number>> = {};
	FACES.forEach((k) => {
		const has = f[k];
		if (has) counts[has] = (counts[has] || 0) + 1;
	});
	const top = (Object.entries(counts) as [Paint, number][]).sort((a, b) => b[1] - a[1])[0];
	const solidLine = solid
		? `<div class="solidline" style="--sc:${COLORS[solid]}"><b>Solid ${CNAME[solid]}</b>. Works ${CNAME[solid]} switches, buttons and boxes.</div>`
		: !top
			? `<div class="solidline" style="--sc:var(--clay)"><b>All bare</b>. Counts as white for white switches, buttons and boxes.</div>`
			: `<div>Not solid: ${top[1]} of 6 faces ${CNAME[top[0]]}.</div>`;
	const entries = Object.entries(need) as [Face, Paint][];
	$("needBox").innerHTML =
		solidLine +
		(entries.length
			? "<div>The target needs:</div>" +
				entries
					.map(([k, v]) => `<div class="needline">${f[k] === v ? "✓" : "○"} ${CNAME[v]} on ${FNAME[k]}</div>`)
					.join("")
			: "<div>T is the top. B is the face touching the floor.</div>");
	$("moves").textContent = domValue(S.lvl === -2 ? S.rolls || 0 : S.hist.length);
	$("moves").nextElementSibling!.textContent = S.lvl === -2 ? "rolls (all count)" : "moves";
	$("undoBtn").disabled = !S.hist.length;
}

export function renderLevels(): void {
	renderStock();
	const nav = $("levels");
	nav.innerHTML = "";
	LEVELS.forEach((L, i) => {
		const b = document.createElement("button");
		const open = unlocked(i);
		b.className = "lvbtn" + (beaten(L) ? " done" : "") + (i === S.lvl ? " cur" : "") + (open ? "" : " locked");
		b.textContent = domValue(i + 1);
		b.title = open ? L.name + (beaten(L) ? ` (best ${beaten(L)})` : "") : `Locked. Beat level ${i} to unlock.`;
		b.disabled = !open;
		if (!open) b.setAttribute("aria-label", `Level ${i + 1}, locked`);
		b.onclick = () => loadLevel(i);
		nav.appendChild(b);
	});
	MERGE_LEVELS.forEach((L, j) => {
		const b = document.createElement("button");
		const current = mergeIndex(S.lvl) === j;
		b.textContent = `M${j + 1}`;
		b.title = L.name + (beaten(L) ? ` (best ${beaten(L)})` : "");
		// Inline, because the stylesheets stay byte for byte the original's
		b.style.cssText =
			MERGE_BUTTON + (current ? "background:var(--clay);color:#1b1e29;" : beaten(L) ? "color:var(--ink);" : "");
		b.onclick = () => loadMergeLevel(j);
		nav.appendChild(b);
	});
}

export function setStatus(html: string, warn?: boolean): void {
	const s = $("status");
	s.innerHTML = html;
	s.classList.toggle("warn", !!warn);
}
