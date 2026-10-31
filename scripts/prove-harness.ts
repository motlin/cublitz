import {spawnSync} from "node:child_process";
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

// Mutates throwaway copies of dist/ and confirms the differential harness fails on each one.
// dist/ itself is never touched and every copy is deleted afterwards.
type Mutation = {name: string; from: string; to: string; grep: string};

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
		from: "duration: 170,",
		to: "duration: 171,",
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
		name: "script: a top-level name replaces a browser global",
		from: "function renderTitle()",
		to: "function stop() {}\nfunction renderTitle()",
		grep: "clash with no browser global",
	},
	{
		name: "script: the bundle turns strict",
		from: "<script>\n",
		to: '<script>\n"use strict";\n',
		grep: "clash with no browser global",
	},
];

const runHarness = (distDir: string, grep: string) =>
	spawnSync("pnpm", ["exec", "playwright", "test", "-g", grep, "--workers=1", "--reporter=line"], {
		encoding: "utf8",
		env: {...process.env, CUBLITZ_DIST_DIR: distDir, CUBLITZ_PORT: "4818"},
	});

const firstError = (output: string): string =>
	(output.match(/Error: .*/)?.[0] ?? "no error line found").replace(/\u001b\[[0-9;]*m/g, "").slice(0, 160);

const scratch = mkdtempSync(join(tmpdir(), "cublitz-prove-"));
let survived = 0;
try {
	const control = join(scratch, "control");
	cpSync("dist", control, {recursive: true});
	const baseline = runHarness(control, MUTATIONS.map((m) => m.grep).join("|"));
	if (baseline.status !== 0) throw new Error(`The unmutated copy already fails:\n${baseline.stdout}`);
	console.log("control: the unmutated copy passes every test used below");

	for (const [i, mutation] of MUTATIONS.entries()) {
		const copy = join(scratch, `mutant-${i}`);
		cpSync("dist", copy, {recursive: true});
		const file = join(copy, "index.html");
		const html = readFileSync(file, "utf8");
		if (html.split(mutation.from).length !== 2) throw new Error(`"${mutation.from}" must occur exactly once in dist/index.html`);
		writeFileSync(file, html.replace(mutation.from, mutation.to));
		const result = runHarness(copy, mutation.grep);
		const caught = result.status !== 0;
		if (!caught) survived++;
		console.log(`${caught ? "caught  " : "SURVIVED"} ${mutation.name}${caught ? ` -> ${firstError(result.stdout)}` : ""}`);
		rmSync(copy, {recursive: true});
	}
} finally {
	rmSync(scratch, {recursive: true, force: true});
}
console.log(survived === 0 ? `All ${MUTATIONS.length} mutations were caught.` : `${survived} mutations survived.`);
process.exit(survived === 0 ? 0 : 1);
