import {type GeneratedLevel, infRank, infRating, infSearch} from "../core/infinite.ts";
import type {LevelSource} from "../core/types.ts";
import {$, domValue} from "./dom.ts";
import {setStatus} from "./hud.ts";
import {setMode} from "./modes.ts";
import {startLevel} from "./play.ts";
import {S} from "./session.ts";
import {SFX} from "./sfx.ts";
import {type BestRun, readBest, readRun, type SavedRun, writeBest, writeRun} from "./storage.ts";

// Infinite mode: endless generated levels, scored against par
export let infinite = false;
export let campaignLvl = 0;
let infNext: GeneratedLevel | null = null;
let infGenToken = 0;
export let run: SavedRun | null = null;
export let best: BestRun;
let newArmed: ReturnType<typeof setTimeout> | null = null;

/** startLevel's note that a campaign level is on the board, which ends any infinite run on screen. */
export const enterCampaignLevel = (i: number): void => {
	campaignLvl = i;
	infinite = false;
};
function newRun(): void {
	run = {seed: Math.floor(Math.random() * 1e9), n: 0, score: 0, effs: [], cleared: 0, streak: 0, bestStreak: 0};
	writeRun(run);
	infNext = null;
}
// Generate level n of the current run without freezing the page: a few tries per tick
function genInf(n: number, cb: (level: GeneratedLevel) => void, background?: boolean): void {
	const token = background ? 0 : ++infGenToken,
		nextBatch = infSearch(run!.seed, n);
	const step = (): void => {
		if (!background && token !== infGenToken) return;
		const lv = nextBatch();
		if (lv) {
			cb(lv);
			return;
		}
		setTimeout(step, 0);
	};
	step();
}
function pregenerate(): void {
	const n = run!.n + 1;
	if (infNext?.inf === n) return;
	genInf(
		n,
		(lv) => {
			if (run!.n + 1 === n) infNext = lv;
		},
		true,
	);
}
function startInfinite(): void {
	if (!run) newRun();
	infinite = true;
	setMode("play");
	loadInfLevel();
}
export function loadInfLevel(): void {
	const n = run!.n;
	const go = (lv: GeneratedLevel): void => {
		if (!infinite || run!.n !== n) return;
		(lv as LevelSource).tip =
			`Every canvas is freshly generated. Par is ${lv.par}. Undo is allowed, but every roll you make counts toward your score.`;
		startLevel(lv, -2);
		pregenerate();
	};
	if (infNext?.inf === n) {
		const lv = infNext;
		infNext = null;
		go(lv);
		return;
	}
	setStatus("Mixing a new canvas…");
	genInf(n, go);
}
export function leaveInfinite(): void {
	infinite = false;
	renderInfCard();
}
export function renderInfCard(): void {
	const on = infinite && S?.lvl === -2;
	$("infCard").hidden = !on;
	$("hintBtn").hidden = $("solBtn").hidden = on;
	if (!on || !run) return;
	$("infSkip").disabled = S.won;
	const rating = infRating(run);
	$("infRank").textContent = infRank(run);
	$("infRating").textContent = run.effs.length < 3 ? `${3 - run.effs.length} more to get ranked` : `rating ${rating}`;
	$("infCleared").textContent = domValue(run.cleared);
	$("infScore").textContent = domValue(run.score);
	$("infStreak").textContent = domValue(run.streak);
	$("infBest").textContent = best.cleared
		? `Best run: ${best.cleared} cleared, ${best.score} points${best.rating ? `, peak rating ${best.rating}` : ""}.`
		: "Your best run will show here.";
}
export function infWin(): void {
	const L = S.L,
		m = Math.max(1, S.rolls || 0),
		par = L.par!;
	const eff = Math.min(1, par / m),
		pts = Math.round(100 * eff);
	run!.effs.push(eff);
	run!.score += pts;
	run!.cleared++;
	run!.streak = m <= par ? run!.streak + 1 : 0;
	run!.bestStreak = Math.max(run!.bestStreak, run!.streak);
	run!.n++;
	writeRun(run);
	const rating = infRating(run!);
	if (run!.cleared > best.cleared || run!.score > best.score || (run!.effs.length >= 3 && rating > best.rating)) {
		best = {
			cleared: Math.max(best.cleared, run!.cleared),
			score: Math.max(best.score, run!.score),
			rating: run!.effs.length >= 3 ? Math.max(best.rating, rating) : best.rating,
		};
		writeBest(best);
	}
	$("winTitle").textContent = m <= par ? "Perfect roll" : "Cleared";
	$("winScore").textContent = `${m} rolls · par ${par} · +${pts} points`;
	$("winNote").textContent =
		run!.effs.length < 3
			? `Clear ${3 - run!.effs.length} more to get your first rank.`
			: `Rank: ${infRank(run!)} (rating ${rating}, from your last ${Math.min(10, run!.effs.length)} canvases).`;
	$("winRetry").hidden = true;
	$("winNext").hidden = false;
	$("winNext").firstChild!.textContent = "Next canvas ";
	renderInfCard();
}

export function initInfinite(): void {
	run = readRun();
	best = readBest();
	$("infSkip").addEventListener("click", () => {
		if (S.busy) return;
		run!.effs.push(0);
		run!.streak = 0;
		run!.n++;
		writeRun(run);
		$("infNote").textContent = "Skipped. That canvas counts as 0 toward your rating.";
		setTimeout(() => {
			$("infNote").textContent = "";
		}, 3500);
		loadInfLevel();
	});
	$("infNew").addEventListener("click", () => {
		const b = $("infNew");
		if (!b.classList.contains("armed")) {
			b.classList.add("armed");
			b.textContent = "Click again to start over";
			clearTimeout(newArmed!);
			newArmed = setTimeout(() => {
				b.classList.remove("armed");
				b.textContent = "New run";
			}, 4000);
			return;
		}
		clearTimeout(newArmed!);
		b.classList.remove("armed");
		b.textContent = "New run";
		newRun();
		loadInfLevel();
	});
	$("titleInf").addEventListener("click", () => {
		SFX.play("start");
		startInfinite();
	});
}
