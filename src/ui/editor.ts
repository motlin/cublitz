import {FACES} from "../core/cube.ts";
import {initState, parseLevel} from "../core/level.ts";
import {LEVELS} from "../core/levels.ts";
import {CNAME, FNAME} from "../core/names.ts";
import {decodeLevel, encodeLevel} from "../core/share.ts";
import {solve} from "../core/solver.ts";
import type {Face, Level, LevelSource, Paint, PieceColor} from "../core/types.ts";
import {$, domValue, type ElementById, needSelect, targetElement, targetInput, targetSelect} from "./dom.ts";
import {blankGrid, draftFromLevel, edCellHTML, edToLevel, newEditor} from "./editor-grid.ts";
import {setMode} from "./modes.ts";
import {startLevel} from "./play.ts";
import {unlocked} from "./session.ts";
import {type EditorCell, type EditorDraft, loadDraft, mine, setMine, writeDraft} from "./storage.ts";
import {cap, COLORS, esc, GLYPH, WGLYPH} from "./text.ts";

// Editor
type Tool = "floor" | "erase" | "start" | "goal" | "paint" | "wash" | "gate" | "wgate" | "switch" | "button" | "box" | "door";
type Check = {ok: boolean; html: string; par?: number; level?: Level};

const TOOLS: [Tool, string][] = [
	["floor", "Floor"],
	["erase", "Erase"],
	["start", "Start"],
	["goal", "Target"],
	["paint", "Puddle"],
	["wash", "Paint remover"],
	["gate", "Gate"],
	["wgate", "White gate"],
	["switch", "Switch"],
	["button", "Button"],
	["box", "Box"],
	["door", "Door"],
];
const COLORED: Tool[] = ["paint", "gate", "switch", "button", "box", "door"];
const PAINT_COLORS = "roygcbp"; // white only exists as switches, buttons, boxes and doors
let ED: EditorDraft | null = null;
let tool: Tool = "floor";
let ecolor: PieceColor = "r";
let wface: Face = "b";
let painting = false;
let lastCheck: Check | null = null;
let armedDelete: string | null = null;

export const editorId = (): string | null => ED!.id;
function saveDraft(): void {
	writeDraft(ED!);
}
export const loadEditorDraft = (): void => {
	ED = loadDraft() || newEditor();
};
export function loadIntoEditor(L: LevelSource, name: string, id: string | null): void {
	ED = draftFromLevel(L, name, id);
	lastCheck = null;
	saveDraft();
}

export function renderEditor(): void {
	if (!ED) return;
	const wrap = $("edGridWrap");
	const size = Math.max(22, Math.min(42, Math.floor(((wrap.clientWidth || 560) - 8) / ED.cols) - 2));
	const g = $("edGrid");
	g.style.setProperty("--ec", size + "px");
	g.style.setProperty("--cols", domValue(ED.cols));
	const need = ED.need;
	g.innerHTML = ED.grid.map((row, y) => row.map((c, x) => edCellHTML(c, need).replace('<div class="ec', `<div data-x="${x}" data-y="${y}" class="ec`)).join("")).join("");
	$("edName").value = ED.name;
	$("edCols").textContent = domValue(ED.cols);
	$("edRows").textContent = domValue(ED.rows);
	for (const f of FACES) needSelect(f).value = ED.need[f] || "";
	document.querySelectorAll<HTMLElement>("#edTools button").forEach((b) => b.setAttribute("aria-pressed", domValue(b.dataset["tool"] === tool)));
	if (ecolor === "w" && (tool === "paint" || tool === "gate")) ecolor = "r";
	document.querySelectorAll<HTMLButtonElement>("#edColors button").forEach((b) => {
		b.setAttribute("aria-pressed", domValue(b.dataset["color"] === ecolor));
		b.disabled = b.dataset["color"] === "w" && (tool === "paint" || tool === "gate");
	});
	$("edColors").classList.toggle("dim", !COLORED.includes(tool));
	$("edColors").hidden = tool === "wgate";
	$("edFaces").hidden = tool !== "wgate";
	document.querySelectorAll<HTMLElement>("#edFaces button").forEach((b) => b.setAttribute("aria-pressed", domValue(b.dataset["face"] === wface)));
	const r = edToLevel(ED);
	$("edCode").value = r.level ? encodeLevel(r.level) : "";
	$("edCodeNote").textContent = r.level ? "Anyone with this code can import your level." : r.error;
	$("edSave").textContent = ED.id ? "Save changes" : "Save to my levels";
	renderCheck();
	renderMine();
}
function renderCheck(): void {
	const el = $("edResult");
	if (!lastCheck) {
		el.className = "ed-result";
		el.innerHTML = "Not checked yet.";
		return;
	}
	el.className = "ed-result " + (lastCheck.ok ? "good" : "bad");
	el.innerHTML = lastCheck.html;
}
function changed(): void {
	lastCheck = null;
	saveDraft();
	renderEditor();
}

function applyTool(x: number, y: number): void {
	const draft = ED!;
	const cur = draft.grid[y]![x];
	let next: EditorCell | null;
	if (tool === "erase") next = null;
	else if (tool === "floor") next = {t: "floor"};
	else if (tool === "start" || tool === "goal" || tool === "wash") next = {t: tool};
	else if (tool === "wgate") next = {t: "wgate", f: wface};
	else next = {t: tool, c: ecolor};
	if (JSON.stringify(cur) === JSON.stringify(next)) return;
	if (tool === "start")
		draft.grid.forEach((row) =>
			row.forEach((c, i) => {
				if (c && c.t === "start") row[i] = {t: "floor"};
			}),
		);
	draft.grid[y]![x] = next;
	changed();
}
function cellFromEvent(e: MouseEvent): [number, number] | null {
	const el = document.elementFromPoint(e.clientX, e.clientY);
	const c = el && el.closest<HTMLElement>("#edGrid .ec");
	return c ? [Number(c.dataset["x"]), Number(c.dataset["y"])] : null;
}
function resize(dc: number, dr: number): void {
	const draft = ED!;
	const cols = Math.max(3, Math.min(18, draft.cols + dc)),
		rows = Math.max(3, Math.min(12, draft.rows + dr));
	const g = blankGrid(cols, rows);
	for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (y < draft.rows && x < draft.cols) g[y]![x] = draft.grid[y]![x]!;
	Object.assign(draft, {cols, rows, grid: g});
	changed();
}

function checkLevel(): Check {
	const r = edToLevel(ED!);
	if (r.error) return {ok: false, html: `<b>Can't check yet.</b> ${r.error}`};
	const L = parseLevel(r.level!);
	const sol = solve(L, initState(L), 1200000);
	if (sol) return {ok: true, par: sol.length, level: L, html: `<b>Solvable in ${sol.length} moves.</b> That becomes the par.`};
	return {ok: false, level: L, html: solve.hitLimit ? "<b>Too big to check.</b> The solver gave up before finding a solution. You can still test it." : "<b>No solution.</b> No sequence of rolls reaches a target that satisfies its needs."};
}
export function renderStock(): void {
	$("edStock").innerHTML = '<option value="">Open a built-in level…</option>' + LEVELS.map((L, i) => (unlocked(i) ? `<option value="${i}">${i + 1}. ${L.name}</option>` : `<option value="${i}" disabled>${i + 1}. Locked</option>`)).join("");
}
function renderMine(): void {
	const list = mine(),
		el = $("edList");
	if (!list.length) {
		el.innerHTML = '<p class="muted">Levels you save appear here. They live in this browser only, so use share codes to move them around.</p>';
		return;
	}
	el.innerHTML = list
		.map(
			(x) => `<li${x.id === ED!.id ? ' class="cur"' : ""}><span class="nm">${esc(x.level.name)}</span>
    <button type="button" data-act="play" data-id="${x.id}">Play</button>
    <button type="button" data-act="edit" data-id="${x.id}">Edit</button>
    <button type="button" data-act="del" data-id="${x.id}" class="${armedDelete === x.id ? "armed" : ""}">${armedDelete === x.id ? "Confirm" : "Delete"}</button></li>`,
		)
		.join("");
}

let needSel: ElementById<"edNeed">;
export function initEditor(): void {
	$("edGrid").addEventListener("pointerdown", (e) => {
		const p = cellFromEvent(e);
		if (!p) return;
		e.preventDefault();
		painting = true;
		try {
			$("edGrid").setPointerCapture(e.pointerId);
		} catch {
			// Painting still works without the capture while the pointer stays over the grid.
		}
		applyTool(...p);
	});
	$("edGrid").addEventListener("pointermove", (e) => {
		if (!painting) return;
		const p = cellFromEvent(e);
		if (p) applyTool(...p);
	});
	addEventListener("pointerup", () => {
		painting = false;
	});
	addEventListener("pointercancel", () => {
		painting = false;
	});

	$("edTools").innerHTML = TOOLS.map(([k, label]) => {
		const sample = k === "erase" ? "void" : k;
		return `<button type="button" data-tool="${k}" aria-pressed="false"><span class="ec ${sample}" style="--ec:20px;--pc:var(--blue)">${k === "wash" ? "<b>✦</b>" : ""}</span>${label}</button>`;
	}).join("");
	$("edTools").addEventListener("click", (e) => {
		const b = targetElement(e).closest("button");
		if (b) {
			tool = b.dataset["tool"] as Tool;
			renderEditor();
		}
	});
	$("edColors").innerHTML = (Object.keys(COLORS) as PieceColor[]).map((c) => `<button type="button" data-color="${c}" aria-pressed="false" aria-label="${CNAME[c]}" style="--pc:${COLORS[c]}"><span>${GLYPH[c]}</span></button>`).join("");
	$("edFaces").innerHTML = '<span class="ed-faces-label">Bare side needed:</span>' + (["b", "t", "n", "s", "e", "w"] as const).map((f) => `<button type="button" data-face="${f}" aria-pressed="false"><span class="ec wgate wg-${f}" style="--ec:20px">${WGLYPH[f] ? `<b>${WGLYPH[f]}</b>` : ""}</span>${cap(FNAME[f])}</button>`).join("");
	$("edFaces").addEventListener("click", (e) => {
		const b = targetElement(e).closest("button");
		if (b) {
			wface = b.dataset["face"] as Face;
			renderEditor();
		}
	});
	$("edColors").addEventListener("click", (e) => {
		const b = targetElement(e).closest("button");
		if (b) {
			ecolor = b.dataset["color"] as PieceColor;
			if (!COLORED.includes(tool)) tool = "paint";
			renderEditor();
		}
	});

	$("edName").addEventListener("input", (e) => {
		const draft = ED!;
		draft.name = targetInput(e).value;
		saveDraft();
		const r = edToLevel(draft);
		if (r.level) $("edCode").value = encodeLevel(r.level);
	});
	document.querySelectorAll<HTMLElement>("[data-resize]").forEach((b) =>
		b.addEventListener("click", () => {
			const [dc, dr] = b.dataset["resize"]!.split(",").map(Number) as [number, number];
			resize(dc, dr);
		}),
	);
	needSel = $("edNeed");
	needSel.innerHTML = FACES.map((f) => `<label for="need-${f}">${cap(FNAME[f])}<select id="need-${f}"><option value="">Any</option>${([...PAINT_COLORS] as Paint[]).map((c) => `<option value="${c}">${cap(CNAME[c])}</option>`).join("")}</select></label>`).join("");
	FACES.forEach((f) =>
		needSelect(f).addEventListener("change", (e) => {
			const v = targetSelect(e).value as Paint | "";
			if (v) ED!.need[f] = v;
			else delete ED!.need[f];
			changed();
		}),
	);

	$("edCheck").onclick = () => {
		$("edResult").innerHTML = "Checking…";
		setTimeout(() => {
			lastCheck = checkLevel();
			renderCheck();
		}, 20);
	};
	$("edTest").onclick = () => {
		const r = edToLevel(ED!);
		if (r.error) {
			lastCheck = {ok: false, html: `<b>Can't test yet.</b> ${r.error}`};
			renderCheck();
			return;
		}
		$("edResult").innerHTML = "Checking…";
		setTimeout(() => {
			lastCheck = checkLevel();
			renderCheck();
			const L = lastCheck.level!;
			L.par = lastCheck.par || null;
			startLevel(L, -1);
			setMode("play");
		}, 20);
	};
	$("edSave").onclick = () => {
		const draft = ED!;
		const r = edToLevel(draft);
		if (r.error) {
			lastCheck = {ok: false, html: `<b>Can't save yet.</b> ${r.error}`};
			renderCheck();
			return;
		}
		const level = r.level!;
		const list = mine();
		const id = draft.id || "L" + Date.now().toString(36);
		const entry = {id, level, saved: Date.now()};
		const i = list.findIndex((x) => x.id === id);
		if (i >= 0) list[i] = entry;
		else list.unshift(entry);
		const ok = setMine(list);
		if (ok) draft.id = id;
		saveDraft();
		lastCheck = {ok, html: ok ? `<b>Saved.</b> “${level.name}” is in your levels on this browser.` : "<b>Couldn’t save.</b> This browser is blocking storage. Copy the share code instead."};
		renderEditor();
	};
	$("edNew").onclick = () => {
		ED = newEditor();
		changed();
	};
	$("edClear").onclick = () => {
		ED!.grid = ED!.grid.map((r) => r.map(() => null));
		changed();
	};
	$("edCopy").onclick = () => {
		const v = $("edCode").value;
		if (!v) return;
		const sel = () => {
			$("edCode").focus();
			$("edCode").select();
			$("edCodeNote").textContent = "Selected. Press Ctrl+C or Cmd+C to copy.";
		};
		try {
			navigator.clipboard.writeText(v).then(() => {
				$("edCodeNote").textContent = "Copied.";
			}, sel);
		} catch {
			sel();
		}
	};
	$("edImport").onclick = () => {
		try {
			const L = decodeLevel($("edImportText").value);
			loadIntoEditor(L, L.name || "Imported", null);
			$("edImportText").value = "";
			$("edImportNote").textContent = `Loaded “${ED!.name}”.`;
			renderEditor();
		} catch {
			$("edImportNote").textContent = "That code didn’t work. Paste the whole thing, starting with CUBLITZ:";
		}
	};
	renderStock();
	$("edStock").onchange = (e) => {
		const select = targetSelect(e);
		if (select.value === "") return;
		const L = LEVELS[+select.value]!;
		loadIntoEditor(L, L.name + " remix", null);
		select.value = "";
		renderEditor();
	};

	$("edList").addEventListener("click", (e) => {
		const b = targetElement(e).closest("button");
		if (!b) return;
		const list = mine(),
			x = list.find((i) => i.id === b.dataset["id"]);
		if (!x) return;
		if (b.dataset["act"] === "edit") {
			armedDelete = null;
			loadIntoEditor(x.level, x.level.name!, x.id);
			renderEditor();
		}
		if (b.dataset["act"] === "play") {
			armedDelete = null;
			loadIntoEditor(x.level, x.level.name!, x.id);
			const L = parseLevel(JSON.parse(JSON.stringify(x.level)) as LevelSource);
			const sol = solve(L, initState(L), 600000);
			L.par = sol ? sol.length : null;
			startLevel(L, -1);
			setMode("play");
		}
		if (b.dataset["act"] === "del") {
			if (armedDelete !== x.id) {
				armedDelete = x.id;
				renderMine();
				return;
			}
			setMine(list.filter((i) => i.id !== x.id));
			armedDelete = null;
			if (ED!.id === x.id) ED!.id = null;
			renderEditor();
		}
	});
}
