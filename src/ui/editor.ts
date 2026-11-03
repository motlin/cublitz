import {FACES} from "../core/cube.ts";
import {initState, parseLevel} from "../core/level.ts";
import {LEVELS} from "../core/levels.ts";
import {CNAME, FNAME} from "../core/names.ts";
import {encodeLevel, levelFromCode} from "../core/share.ts";
import {solve} from "../core/solver.ts";
import type {Face, Level, LevelSource, Paint, PieceColor} from "../core/types.ts";
import {$, domValue, type ElementById, needSelect, targetElement, targetInput, targetSelect} from "./dom.ts";
import {blankGrid, draftFromLevel, edCellHTML, edToLevel, LOOSE_CUBE_STYLE, newEditor} from "./editor-grid.ts";
import {setMode} from "./modes.ts";
import {startLevel} from "./play.ts";
import {unlocked} from "./session.ts";
import {fingerGestures, type CameraMove, type FingerEvent} from "./gestures.ts";
import {type EditorCell, type EditorDraft, loadDraft, mine, setMine, writeDraft} from "./storage.ts";
import {cap, COLORS, esc, GLYPH, WGLYPH} from "./text.ts";
import {addFingerSurface, isCompact, takesTouch} from "./touch.ts";

// Editor
type Tool =
	| "floor"
	| "erase"
	| "start"
	| "goal"
	| "paint"
	| "wash"
	| "gate"
	| "wgate"
	| "switch"
	| "button"
	| "box"
	| "door"
	| "cube";
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
/** The player has typed or pasted into the share box since it last had focus, so editing the level leaves it alone. */
let codeTyped = false;

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
	const size = isCompact()
		? touchCellSize()
		: Math.max(22, Math.min(42, Math.floor(((wrap.clientWidth || 560) - 8) / ED.cols) - 2));
	const g = $("edGrid");
	g.style.setProperty("--ec", size + "px");
	g.style.setProperty("--cols", domValue(ED.cols));
	const need = ED.need;
	g.innerHTML = ED.grid
		.map((row, y) =>
			row
				.map((c, x) =>
					edCellHTML(c, need).replace('<div class="ec', `<div data-x="${x}" data-y="${y}" class="ec`),
				)
				.join(""),
		)
		.join("");
	$("edName").value = ED.name;
	$("edCols").textContent = domValue(ED.cols);
	$("edRows").textContent = domValue(ED.rows);
	for (const f of FACES) needSelect(f).value = ED.need[f] || "";
	document.querySelectorAll<HTMLElement>("#edTools button").forEach((b) => {
		b.setAttribute("aria-pressed", domValue(b.dataset["tool"] === tool));
	});
	if (ecolor === "w" && (tool === "paint" || tool === "gate")) ecolor = "r";
	document.querySelectorAll<HTMLButtonElement>("#edColors button").forEach((b) => {
		b.setAttribute("aria-pressed", domValue(b.dataset["color"] === ecolor));
		b.disabled = b.dataset["color"] === "w" && (tool === "paint" || tool === "gate");
	});
	$("edColors").classList.toggle("dim", !COLORED.includes(tool));
	$("edColors").hidden = tool === "wgate";
	$("edFaces").hidden = tool !== "wgate";
	document.querySelectorAll<HTMLElement>("#edFaces button").forEach((b) => {
		b.setAttribute("aria-pressed", domValue(b.dataset["face"] === wface));
	});
	const r = edToLevel(ED);
	if (!codeTyped) $("edCode").value = r.level ? encodeLevel(r.level) : "";
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
	else if (tool === "start" || tool === "goal" || tool === "wash" || tool === "cube") next = {t: tool};
	else if (tool === "wgate") next = {t: "wgate", f: wface};
	else next = {t: tool, c: ecolor};
	if (JSON.stringify(cur) === JSON.stringify(next)) return;
	if (tool === "start")
		draft.grid.forEach((row) => {
			row.forEach((c, i) => {
				if (c?.t === "start") row[i] = {t: "floor"};
			});
		});
	draft.grid[y]![x] = next;
	changed();
}
function cellFromEvent(e: FingerEvent): [number, number] | null {
	const el = document.elementFromPoint(e.clientX, e.clientY);
	const c = el?.closest<HTMLElement>("#edGrid .ec");
	return c ? [Number(c.dataset["x"]), Number(c.dataset["y"])] : null;
}
function resize(dc: number, dr: number): void {
	const draft = ED!;
	gridZoom = 1;
	const cols = Math.max(3, Math.min(18, draft.cols + dc)),
		rows = Math.max(3, Math.min(12, draft.rows + dr));
	const g = blankGrid(cols, rows);
	for (let y = 0; y < rows; y++)
		for (let x = 0; x < cols; x++) if (y < draft.rows && x < draft.cols) g[y]![x] = draft.grid[y]![x]!;
	Object.assign(draft, {cols, rows, grid: g});
	changed();
}

function checkLevel(): Check {
	const r = edToLevel(ED!);
	if (r.error) return {ok: false, html: `<b>Can't check yet.</b> ${r.error}`};
	const L = parseLevel(r.level!);
	const sol = solve(L, initState(L), 1200000);
	if (sol)
		return {
			ok: true,
			par: sol.length,
			level: L,
			html: `<b>Solvable in ${sol.length} moves.</b> That becomes the par.`,
		};
	return {
		ok: false,
		level: L,
		html: solve.hitLimit
			? "<b>Too big to check.</b> The solver gave up before finding a solution. You can still test it."
			: "<b>No solution.</b> No sequence of rolls reaches a target that satisfies its needs.",
	};
}
export function renderStock(): void {
	$("edStock").innerHTML =
		'<option value="">Open a built-in level…</option>' +
		LEVELS.map((L, i) =>
			unlocked(i)
				? `<option value="${i}">${i + 1}. ${L.name}</option>`
				: `<option value="${i}" disabled>${i + 1}. Locked</option>`,
		).join("");
}
function renderMine(): void {
	const list = mine(),
		el = $("edList");
	if (!list.length) {
		el.innerHTML =
			'<p class="muted">Levels you save appear here. They live in this browser only, so use share codes to move them around.</p>';
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

// On a phone the grid starts from the size that fits, so the whole level shows, and two fingers zoom from there.
const TOUCH_MIN_CELL = 10;
const TOUCH_MAX_CELL = 56;
/** A second finger this soon after the first means it was the start of a pinch, not a stroke. */
const PINCH_GRACE = 400;
let gridZoom = 1;
let stroke: {at: number; grid: string} | null = null;

function touchFitCell(): number {
	const draft = ED!;
	const room = innerHeight - document.querySelector(".ed-toolbar")!.getBoundingClientRect().height - 24;
	const wide = $("edGridWrap").clientWidth - 8;
	return Math.max(TOUCH_MIN_CELL, Math.floor(Math.min(wide / draft.cols, room / draft.rows)) - 2);
}
function touchCellSize(): number {
	return Math.min(Math.max(TOUCH_MAX_CELL, touchFitCell()), Math.round(touchFitCell() * gridZoom));
}
function zoomGrid({ratio, dx, dy, x, y}: CameraMove): void {
	const wrap = $("edGridWrap"),
		g = $("edGrid");
	const before = touchCellSize();
	// The zoom keeps its fractions, or a slow pinch's small steps would each round back to the same tile size.
	const fit = touchFitCell();
	gridZoom = Math.max(1, Math.min(Math.max(TOUCH_MAX_CELL, fit) / fit, gridZoom * ratio));
	const after = touchCellSize();
	g.style.setProperty("--ec", after + "px");
	// The spot between the fingers stays under them.
	const rect = wrap.getBoundingClientRect();
	const fromX = x - rect.left,
		fromY = y - rect.top;
	const scale = (after + 2) / (before + 2);
	const top = wrap.scrollTop;
	wrap.scrollLeft = (wrap.scrollLeft + fromX) * scale - fromX - dx;
	wrap.scrollTop = (wrap.scrollTop + fromY) * scale - fromY - dy;
	// A grid with no room to pan that way hands the drag to the page, which is what scrolls it there.
	if (wrap.scrollTop === top && scale === 1) scrollBy(0, -dy);
}
function touchPaint(e: FingerEvent): void {
	const p = cellFromEvent(e);
	if (p) applyTool(...p);
}

let needSel: ElementById<"edNeed">;
/** The share code of the level being edited, or "" when it is not a valid level yet. */
function currentCode(): string {
	const r = edToLevel(ED!);
	return r.level ? encodeLevel(r.level) : "";
}
/** Copies text to the clipboard; when the browser refuses, puts it in the share box selected, with a note saying how to copy it. */
function copyOrSelect(text: string, selectedNote: string): void {
	const select = (): void => {
		const box = $("edCode");
		box.value = text;
		box.focus();
		box.setSelectionRange(0, text.length);
		$("edCodeNote").textContent = selectedNote;
	};
	try {
		navigator.clipboard.writeText(text).then(() => {
			$("edCodeNote").textContent = "Copied.";
			return undefined;
		}, select);
	} catch {
		select();
	}
}
/** One box shows the level's share code and takes a pasted code or link to load, beside Copy code, Copy link and Load. */
function initShareBox(): void {
	const box = $("edCode");
	box.readOnly = false;
	box.placeholder = "Paste a CUBLITZ: code or link, then press Load";
	$("edImportText").closest("label")!.remove();
	$("edCopy").insertAdjacentHTML("afterend", '<button class="act" id="edCopyLink" type="button">Copy link</button>');
	const copyLink = document.getElementById("edCopyLink")!;
	copyLink.after($("edImport"));
	$("edImportNote").closest(".row")!.remove();
	// A tap or click that focuses the box selects all of it, ready to copy or to paste over.
	let clickSelects = false;
	const selectAll = (): void => {
		box.setSelectionRange(0, box.value.length);
	};
	box.addEventListener("pointerdown", () => {
		clickSelects = document.activeElement !== box;
	});
	box.addEventListener("focus", () => {
		codeTyped = false;
		selectAll();
	});
	box.addEventListener("click", () => {
		if (clickSelects) selectAll();
		clickSelects = false;
	});
	box.addEventListener("input", () => {
		codeTyped = true;
	});
	box.addEventListener("blur", () => {
		codeTyped = false;
	});
	copyLink.addEventListener("click", () => {
		const code = currentCode();
		if (!code) return;
		copyOrSelect(`${location.origin}${location.pathname}?${code}`, "Selected. Copy the link from the box.");
	});
	$("edImport").addEventListener("click", () => {
		try {
			const L = levelFromCode(box.value);
			loadIntoEditor(L, L.name || "Imported", null);
			codeTyped = false;
			renderEditor();
			$("edCodeNote").textContent = `Loaded “${ED!.name}”.`;
		} catch {
			$("edCodeNote").textContent = "That code didn’t work. Paste the whole thing, starting with CUBLITZ:";
		}
	});
}
export function initEditor(): void {
	const fingers = fingerGestures(
		{
			press: (e) => {
				stroke = {at: performance.now(), grid: JSON.stringify(ED!.grid)};
				touchPaint(e);
			},
			drag: touchPaint,
			cameraStart: () => {
				if (stroke && performance.now() - stroke.at < PINCH_GRACE && stroke.grid !== JSON.stringify(ED!.grid)) {
					ED!.grid = JSON.parse(stroke.grid) as EditorDraft["grid"];
					changed();
				}
				stroke = null;
			},
			camera: zoomGrid,
		},
		{eagerCamera: true, together: PINCH_GRACE},
	);
	addFingerSurface(fingers, $("edGrid"));
	$("edGrid").addEventListener("pointerdown", (e) => {
		if (takesTouch(e)) {
			e.preventDefault();
			return;
		}
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

	// The cube's button is apart from TOOLS, which stays the original's list on the page's global scope.
	$("edTools").innerHTML = `${TOOLS.map(([k, label]) => {
		const sample = k === "erase" ? "void" : k;
		return `<button type="button" data-tool="${k}" aria-pressed="false"><span class="ec ${sample}" style="--ec:20px;--pc:var(--blue)">${k === "wash" ? "<b>✦</b>" : ""}</span>${label}</button>`;
	}).join(
		"",
	)}<button type="button" data-tool="cube" aria-pressed="false"><span class="ec loose" style="--ec:20px;--pc:var(--blue);${LOOSE_CUBE_STYLE}"></span>Loose cube</button>`;
	$("edTools").addEventListener("click", (e) => {
		const b = targetElement(e).closest("button");
		if (b) {
			tool = b.dataset["tool"] as Tool;
			renderEditor();
		}
	});
	$("edColors").innerHTML = (Object.keys(COLORS) as PieceColor[])
		.map(
			(c) =>
				`<button type="button" data-color="${c}" aria-pressed="false" aria-label="${CNAME[c]}" style="--pc:${COLORS[c]}"><span>${GLYPH[c]}</span></button>`,
		)
		.join("");
	$("edFaces").innerHTML =
		'<span class="ed-faces-label">Bare side needed:</span>' +
		(["b", "t", "n", "s", "e", "w"] as const)
			.map(
				(f) =>
					`<button type="button" data-face="${f}" aria-pressed="false"><span class="ec wgate wg-${f}" style="--ec:20px">${WGLYPH[f] ? `<b>${WGLYPH[f]}</b>` : ""}</span>${cap(FNAME[f])}</button>`,
			)
			.join("");
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
	document.querySelectorAll<HTMLElement>("[data-resize]").forEach((b) => {
		b.addEventListener("click", () => {
			const [dc, dr] = b.dataset["resize"]!.split(",").map(Number) as [number, number];
			resize(dc, dr);
		});
	});
	needSel = $("edNeed");
	needSel.innerHTML = FACES.map(
		(f) =>
			`<label for="need-${f}">${cap(FNAME[f])}<select id="need-${f}"><option value="">Any</option>${(Array.from(PAINT_COLORS) as Paint[]).map((c) => `<option value="${c}">${cap(CNAME[c])}</option>`).join("")}</select></label>`,
	).join("");
	FACES.forEach((f) => {
		needSelect(f).addEventListener("change", (e) => {
			const v = targetSelect(e).value as Paint | "";
			if (v) ED!.need[f] = v;
			else Reflect.deleteProperty(ED!.need, f);
			changed();
		});
	});

	$("edCheck").addEventListener("click", () => {
		$("edResult").innerHTML = "Checking…";
		setTimeout(() => {
			lastCheck = checkLevel();
			renderCheck();
		}, 20);
	});
	$("edTest").addEventListener("click", () => {
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
	});
	$("edSave").addEventListener("click", () => {
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
		lastCheck = {
			ok,
			html: ok
				? `<b>Saved.</b> “${level.name}” is in your levels on this browser.`
				: "<b>Couldn’t save.</b> This browser is blocking storage. Copy the share code instead.",
		};
		renderEditor();
	});
	$("edNew").addEventListener("click", () => {
		ED = newEditor();
		changed();
	});
	$("edClear").addEventListener("click", () => {
		ED!.grid = ED!.grid.map((r) => r.map(() => null));
		changed();
	});
	$("edCopy").addEventListener("click", () => {
		const code = currentCode();
		if (!code) return;
		copyOrSelect(code, "Selected. Press Ctrl+C or Cmd+C to copy.");
	});
	initShareBox();
	renderStock();
	$("edStock").addEventListener("change", (e) => {
		const select = targetSelect(e);
		if (select.value === "") return;
		const L = LEVELS[+select.value]!;
		loadIntoEditor(L, L.name + " remix", null);
		select.value = "";
		renderEditor();
	});

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
