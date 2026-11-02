import {spawnSync} from "node:child_process";
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {grepMatchedPassingTest, type PlaywrightReport, verdict} from "./harness-verdict.ts";

// Mutates throwaway copies of dist/ and confirms the differential harness fails on each one.
// dist/ itself is never touched and every copy is deleted afterwards.
// A mutation either replaces text that occurs exactly once, or computes the mutant itself, returning null when the
// copy no longer holds what it looks for. Either way a miss is reported as INVALID, so the other mutations still run.
type Mutation = {name: string; grep: string} & ({from: string; to: string} | {mutate: (html: string) => string | null});

const replaceOnce = (html: string, from: string, to: string): string | null =>
	html.split(from).length === 2 ? html.replace(from, () => to) : null;

// Swaps two adjacent campaign levels, each cut from the start of its object to the start of the next level's
// object, so the bundler's formatting of the level data does not matter.
const swapLevels = (html: string, first: string, second: string, following: string): string | null => {
	const starts = [first, second, following].map((name) => {
		const anchor = new RegExp(String.raw`\{\s*"?name"?\s*:\s*"${name}"`, "g");
		const found = [...html.matchAll(anchor)];
		const [only] = found;
		return found.length === 1 && only ? only.index : -1;
	});
	const [a, b, c] = starts as [number, number, number];
	if (a < 0 || !(a < b && b < c)) return null;
	return html.slice(0, a) + html.slice(b, c) + html.slice(a, b) + html.slice(c);
};

const MUTATIONS: Mutation[] = [
	{
		name: "rule: gates judge the top face instead of the bottom",
		from: 'if (cell.t === "gate" && nf.b !== cell.c)',
		to: 'if (cell.t === "gate" && nf.t !== cell.c)',
		grep: "level 3 Blue Fence",
	},
	{
		name: "rule: infinite mode draws a different seed stream",
		from: "infRng(seed + n * 7919)",
		to: "infRng(seed + n * 7920)",
		grep: "a pinned seed plays",
	},
	{
		name: "CSS value: flash lasts one millisecond longer",
		from: ".tile.flash > i { animation: flash 420ms ease-out; }",
		to: ".tile.flash > i { animation: flash 421ms ease-out; }",
		grep: "level 2 First Coat",
	},
	{
		name: "CSS value: status line gains an outline",
		from: ".status {",
		to: ".status { outline: 1px solid red;",
		grep: "screenshots match at desktop",
	},
	{
		name: "string: edge message reworded",
		from: "Nothing to roll onto that way.",
		to: "Nothing to roll onto there.",
		grep: "blocked move: edge",
	},
	{
		name: "timing: roll animation is 171ms",
		from: "{ transform: ROT[d] }], {\n\t\tduration: 170,",
		to: "{ transform: ROT[d] }], {\n\t\tduration: 171,",
		grep: "level 1 First Roll",
	},
	{
		name: "sound: undo blip is a different pitch",
		from: "tone(560, .08,",
		to: "tone(561, .08,",
		grep: "undo and restart",
	},
	{
		name: "storage: sound key renamed",
		from: 'sound: "cubist-sound-v1"',
		to: 'sound: "cublitz-sound-v1"',
		grep: "sound: toggle",
	},
	{
		name: "share code: prefix changed",
		from: '"CUBLITZ:" + btoa',
		to: '"CUBLITZ2:" + btoa',
		grep: "share code round trip",
	},
	{
		name: "input: swipe threshold changed",
		from: "Math.abs(dy)) < 24)",
		to: "Math.abs(dy)) < 8)",
		grep: "mobile viewport: swipe",
	},
	{
		name: "script: a helper leaks into global scope",
		from: "let progress,",
		to: "let leaked, progress,",
		grep: "global scope is the original's",
	},
	{
		name: "script: a function leaves window",
		from: 'Object.defineProperty(window, "mine", {value: function mine()',
		to: 'Object.defineProperty(window, "mineX", {value: function mine()',
		grep: "global scope is the original's",
	},
	{
		name: "script: the bundle turns strict",
		from: "<script>\n",
		to: '<script>\n"use strict";\n',
		grep: "the bundle is a sloppy script",
	},
	{
		name: "script: dist is not what the source builds",
		from: "{ transform: ROT[d] }], {\n\t\tduration: 170,",
		to: "{ transform: ROT[d] }], {\n\t\tduration: 170 ,",
		grep: "what the current source builds",
	},
	{
		name: "console: an uncaught error names another variable",
		from: "run.effs.push(0);",
		to: "(0, run).effs.push(0);",
		grep: "uncaught errors read the same",
	},
	{
		name: "console: the hot hooks are read once less",
		from: "window.claude?.hot?.ready ? window.claude.hot.ready(start)",
		to: "window.claude?.hot?.ready?.call(null, start) ?? false ? 0 : false ? window.claude.hot.ready(start)",
		grep: "window.claude.hot",
	},
	{
		name: "failure text: the hint's give-up message reworded",
		from: "The hint gave up on this one.",
		to: "The hint stopped on this one.",
		grep: "solver gives up",
	},
	{
		name: "failure text: the solver's give-up message reworded",
		from: "The solver gave up from this position.",
		to: "The solver stopped from this position.",
		grep: "solver gives up",
	},
	{
		name: "failure text: blocked storage reworded",
		from: "This browser is blocking storage.",
		to: "This browser blocks storage.",
		grep: "blocked storage",
	},
	{
		name: "failure text: clipboard fallback reworded",
		from: "Selected. Press Ctrl+C or Cmd+C to copy.",
		to: "Selected. Press Ctrl+C to copy.",
		grep: "copying a share code",
	},
	{
		name: "fallback: the old WebKit audio name is gone",
		from: "window.AudioContext || window.webkitAudioContext",
		to: "window.AudioContext",
		grep: "audio available",
	},
	{
		name: "fallback: setting the hash is gone",
		from: "location.hash = h;",
		to: "",
		grep: "replaceState throwing",
	},
	{
		name: "input: pointercancel no longer ends painting",
		from: 'addEventListener("pointercancel", () => {\n\t\tpainting = false;',
		to: 'addEventListener("pointercancel", () => {\n',
		grep: "pointercancel ends painting",
	},
	{
		name: "input: arrow keys get through an open tip",
		from: "else if (KEYMAP[e.key]) e.preventDefault();",
		to: "",
		grep: "arrow keys are swallowed",
	},
	{
		name: "focus: the next-canvas button may scroll",
		from: '$("winNext").focus({ preventScroll: true })',
		to: '$("winNext").focus({ preventScroll: false })',
		grep: "focus moves without scrolling",
	},
	{
		name: "focus: the tip's button may scroll",
		from: '$("tipOk").focus({ preventScroll: true })',
		to: '$("tipOk").focus({ preventScroll: false })',
		grep: "focus moves without scrolling",
	},
	{
		name: "score: a higher score alone no longer raises the best",
		from: "|| run.score > best.score ",
		to: "",
		grep: "raises the best score",
	},
	{
		name: "history: mode changes push entries instead of replacing the current one",
		from: 'history.replaceState(null, "", h || location.pathname + location.search);',
		to: 'history.pushState(null, "", h || location.pathname + location.search);',
		grep: "navigation: brand",
	},
	{
		name: "clipboard fallback: says selected but selects nothing",
		from: '$("edCode").select();',
		to: "",
		grep: "copying a share code",
	},
	{
		name: "input: painting no longer captures the pointer",
		from: '$("edGrid").setPointerCapture(e.pointerId);',
		to: "",
		grep: "drag painting",
	},
	{
		name: "input: game keys ignore no modifier at all",
		from: "if (e.metaKey || e.ctrlKey || e.altKey) return;",
		to: "",
		grep: "game keys with",
	},
	{
		name: "input: game keys roll with Meta held",
		from: "if (e.metaKey || e.ctrlKey || e.altKey) return;",
		to: "if (e.ctrlKey || e.altKey) return;",
		grep: "game keys with Meta",
	},
	{
		name: "input: game keys roll with Control held",
		from: "if (e.metaKey || e.ctrlKey || e.altKey) return;",
		to: "if (e.metaKey || e.altKey) return;",
		grep: "game keys with Control",
	},
	{
		name: "input: game keys roll with Alt held",
		from: "if (e.metaKey || e.ctrlKey || e.altKey) return;",
		to: "if (e.metaKey || e.ctrlKey) return;",
		grep: "game keys with Alt",
	},
	{
		name: "input: the M key toggles sound with Alt held",
		from: "!e.metaKey && !e.ctrlKey && !e.altKey && !/INPUT",
		to: "!e.metaKey && !e.ctrlKey && !/INPUT",
		grep: "M key with Alt",
	},
	{
		name: "storage: unparseable JSON rethrows from loadJSON",
		from: "return JSON.parse(localStorage.getItem(key)) || fallback;\n\t} catch {\n\t\treturn fallback;",
		to: "return JSON.parse(localStorage.getItem(key)) || fallback;\n\t} catch (e) {\n\t\tthrow e;",
		grep: "unparseable JSON",
	},
	{
		name: "storage: unparseable JSON rethrows from readObject",
		from: 'return JSON.parse(localStorage.getItem(key) || "{}") || {};\n\t} catch {\n\t\treturn {};',
		to: 'return JSON.parse(localStorage.getItem(key) || "{}") || {};\n\t} catch (e) {\n\t\tthrow e;',
		grep: "unparseable JSON",
	},
	{
		name: "timer: confirming a reset leaves the disarm timer running",
		from: "clearTimeout(resetTimer);\n\t\teraseProgress();",
		to: "eraseProgress();",
		grep: "title screen: progress text",
	},
	{
		name: "score: the rating window is nine canvases",
		from: "r.effs.slice(-10)",
		to: "r.effs.slice(-9)",
		grep: "rating averages the last ten",
	},
	{
		name: "hooks: hot data resumes a locked level",
		from: "data.name && unlocked(data.lvl) && data.st",
		to: "data.name && data.st",
		grep: "locked level",
	},
	{
		name: "CSS at runtime: a win adds a style element",
		from: '$("winNext").focus({ preventScroll: true });',
		to: '$("winNext").focus({ preventScroll: true }); document.head.append(Object.assign(document.createElement("style"), {textContent: ".title-keys{color:red}"}));',
		grep: "focus moves without scrolling",
	},
	{
		name: "CSS at runtime: a win adds a rule to the sheet",
		from: '$("winNext").focus({ preventScroll: true });',
		to: '$("winNext").focus({ preventScroll: true }); document.styleSheets[0].insertRule(".title-keys{color:red}");',
		grep: "focus moves without scrolling",
	},
	{
		name: "sound: the noise buffer is filled backwards, with the same sum",
		from: "d[i] = Math.random() * 2 - 1;",
		to: "d[d.length - 1 - i] = Math.random() * 2 - 1;",
		grep: "sound: toggle|every sound effect",
	},
	{
		name: "intentional divergence: Skip canvas stays usable on the win card",
		from: '$("infSkip").disabled = S.won;',
		to: "",
		grep: "Skip canvas is disabled on the win card",
	},
	{
		name: "intentional divergence: the white gates tip goes back to the original",
		from: "Paint stays on until a paint remover wipes it, so every puddle",
		to: "Paint never comes off, so every puddle",
		grep: "no longer say that paint never comes off",
	},
	{
		name: "intentional divergence: level 23's tip goes back to the original",
		from: "top bare for the second. Nothing here takes paint off.",
		to: "top bare for the second. Paint never comes off.",
		grep: "no longer say that paint never comes off",
	},
	{
		name: "intentional divergence: the rolling tip goes back to the original",
		from: "Swipe or use the arrows to roll. Roll the cube to the target.",
		to: "Use the arrow keys, WASD, or swipe on a phone to roll your cube one tile at a time. Each roll tips it over an edge, so a different side ends up on the floor. It can only roll onto tiles, never off the edge. Reach the glowing target to finish the level.",
		grep: "rolling tip is two short sentences",
	},
	{
		name: "intentional divergence: the wet paint tip goes back to the original",
		from: "Roll onto a puddle and the face touching the floor takes its color. It stays that color until another puddle covers it.",
		to: "When your cube rolls onto a puddle, the face touching the floor gets painted that color. The paint stays on that face until another puddle covers it.",
		grep: "tutorial pop-ups after the rolling tip are reworded",
	},
	{
		name: "intentional divergence: Prism's tip goes back to the original",
		from: "Clear a red gate and a blue wall, then finish with green on top and blue facing north.",
		to: "Finish with green on top and blue facing north, after clearing a red gate and a blue wall.",
		grep: "level 8 Prism",
	},
	{
		name: "intentional divergence: the infinite mode tip goes back to the original",
		from: "Every canvas is new. Par is ",
		to: "Every canvas is freshly generated. Par is ",
		grep: "infinite mode tip is short",
	},
	{
		name: "intentional divergence: the white gate hint says to spend bare faces carefully again",
		from: "} left.`",
		to: "} left, so spend them carefully.`",
		grep: "hints at every tier while solving level 2[1-5]",
	},
	{
		name: "intentional divergence: Checkpoints goes back before Crown",
		mutate: (html) => swapLevels(html, "Crown", "Checkpoints", "Stripes"),
		grep: "level 5 Crown",
	},
	{
		name: "intentional divergence: Next level goes back to the following level even when it is beaten",
		from: "const next = LEVELS.findIndex((L, j) => j > i && !beaten(L));",
		to: "const next = -1;",
		grep: "Next level after Crown skips Checkpoints",
	},
	{
		name: "intentional divergence: a hot-reload snapshot is restored without checking its level's name",
		from: "LEVELS[data.lvl]?.name === data.name && ",
		to: "",
		grep: "hot data from the old order",
	},
	{
		name: "intentional divergence: the palette goes back to the random comparator sort",
		from: "shuffle(PALETTE_ORDER, R)",
		to: "[...PALETTE_ORDER].sort(() => R() - .5)",
		grep: "one seed generates the same levels",
	},
	{
		name: "intentional divergence: the shuffle can no longer leave an item in place",
		from: "Math.floor(R() * (i + 1))",
		to: "Math.floor(R() * i)",
		grep: "a pinned seed plays",
	},
	{
		name: "solver: the default limit is 300000",
		from: "limit = 4e5",
		to: "limit = 3e5",
		grep: "default limit",
	},
];

const scratch = mkdtempSync(join(tmpdir(), "cublitz-prove-"));
// `just prove-harness <text>` proves only the mutations whose name contains the text.
const only = process.argv[2] ?? "";
const selected = MUTATIONS.filter((m) => m.name.includes(only));
if (selected.length === 0) throw new Error(`No mutation's name contains "${only}"`);

const runHarness = (distDir: string, grep: string): {status: number | null; report: PlaywrightReport | null} => {
	const reportFile = join(scratch, "report.json");
	rmSync(reportFile, {force: true});
	const {status} = spawnSync("pnpm", ["exec", "playwright", "test", "-g", grep, "--workers=1", "--reporter=json"], {
		encoding: "utf8",
		maxBuffer: 1 << 28,
		env: {...process.env, CUBLITZ_DIST_DIR: distDir, CUBLITZ_PORT: "4818", PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile},
	});
	return {
		status,
		report: existsSync(reportFile) ? (JSON.parse(readFileSync(reportFile, "utf8")) as PlaywrightReport) : null,
	};
};

let survived = 0;
let invalid = 0;
try {
	const control = join(scratch, "control");
	cpSync("dist", control, {recursive: true});
	const baseline = runHarness(control, selected.map((m) => m.grep).join("|"));
	const {report: baselineReport} = baseline;
	const baselineVerdict = verdict(baseline.status, baselineReport);
	if (baselineVerdict.kind !== "passed" || !baselineReport)
		throw new Error(`The unmutated copy does not pass: ${JSON.stringify(baselineVerdict)}`);
	const unmatched = selected.filter((m) => !grepMatchedPassingTest(baselineReport, m.grep));
	if (unmatched.length > 0)
		throw new Error(`These greps select no passing test: ${unmatched.map((m) => m.grep).join(", ")}`);
	console.log("control: the unmutated copy passes, and each grep below selects a test that passed");

	for (const [i, mutation] of selected.entries()) {
		const copy = join(scratch, `mutant-${i}`);
		cpSync("dist", copy, {recursive: true});
		const file = join(copy, "index.html");
		const html = readFileSync(file, "utf8");
		const mutant = "mutate" in mutation ? mutation.mutate(html) : replaceOnce(html, mutation.from, mutation.to);
		if (mutant === null) {
			invalid++;
			console.log(`INVALID  ${mutation.name} -> the mutation's text is not in dist/index.html exactly once`);
			rmSync(copy, {recursive: true});
			continue;
		}
		writeFileSync(file, mutant);
		const {status, report} = runHarness(copy, mutation.grep);
		const result = verdict(status, report);
		if (result.kind === "caught") console.log(`caught   ${mutation.name} -> ${result.detail}`);
		else if (result.kind === "passed") {
			survived++;
			console.log(`SURVIVED ${mutation.name}`);
		} else {
			invalid++;
			console.log(`INVALID  ${mutation.name} -> ${result.detail}`);
		}
		rmSync(copy, {recursive: true});
	}
} finally {
	rmSync(scratch, {recursive: true, force: true});
}
const clean = survived === 0 && invalid === 0;
console.log(
	clean
		? `All ${selected.length} mutations were caught.`
		: `${survived} mutations survived and ${invalid} runs were invalid.`,
);
process.exit(clean ? 0 : 1);
