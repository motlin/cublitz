import {initState, needEntries, parseLevel} from "../core/level.ts";
import {LEVELS} from "../core/levels.ts";
import {MERGE_LEVELS} from "../core/merge-levels.ts";
import {CNAME, dirWord, FNAME} from "../core/names.ts";
import {solidColorOf} from "../core/prism.ts";
import {judgedGoalFaces, openColors, tryMove} from "../core/rules.ts";
import type {Direction, Level, LevelSource, MoveFailure, Paint, State, SwitchCell} from "../core/types.ts";
import
{
	aimShadows,
	boxEls,
	C,
	placeCube,
	pulse,
	pulseBlock,
	renderBoard,
	renderPieces,
	rollBlock,
	rollerEl,
	shadowEl,
	tiltBlock,
} from "./board.ts";
import {$, domValue} from "./dom.ts";
import {clearHint, clearHintState, forgetHintPosition, hintAfterMove} from "./hint.ts";
import {renderHud, renderLevels, setStatus} from "./hud.ts";
import {campaignLvl, enterCampaignLevel, infWin, renderInfCard} from "./infinite-mode.ts";
import {mode} from "./modes.ts";
import {reduced, recordWin, S, setSession, unlocked} from "./session.ts";
import {SFX} from "./sfx.ts";
import {clearSolution, planSolution, solState, solutionAfterMove, stopAutoReveal} from "./solution.ts";
import {cap} from "./text.ts";
import {clearTipQueue, queueTips, tipOpen} from "./tips.ts";
import {winCard} from "./win-card.ts";

const ROT: Record<Direction, string> =
{
	E: "rotateY(90deg)",
	W: "rotateY(-90deg)",
	N: "rotateX(90deg)",
	S: "rotateX(-90deg)",
};
const ORIGIN: Record<Direction, string> =
{
	E: "100% 50% 0",
	W: "0% 50% 0",
	N: "50% 0% 0",
	S: "50% 100% 0",
};
const TILT: Record<Direction, string> =
{
	E: "rotateY(14deg)",
	W: "rotateY(-14deg)",
	N: "rotateX(14deg)",
	S: "rotateX(-14deg)",
};

/** S.lvl for a level from a shared link. */
export const SHARED = -3;

/** S.lvl for the first merge level. Later ones count down from here. */
const FIRST_MERGE = -10;
/** Which merge level an S.lvl means, or -1 when it means something else. */
export const mergeIndex = (lvl: number): number => (lvl <= FIRST_MERGE ? FIRST_MERGE - lvl : -1);
export function loadMergeLevel(j: number): void
{
	enterCampaignLevel(campaignLvl);
	startLevel(MERGE_LEVELS[j]!, FIRST_MERGE - j);
}

export type Snapshot =
{
	st?: State;
	hist?: State[];
};

let queued: Direction | null = null;

export function loadLevel(i: number, snap?: Snapshot): void
{
	if (!unlocked(i)) return;
	startLevel(LEVELS[i]!, i, snap);
}
export function startLevel(
	source: LevelSource,
	i: number,
	snap?: Snapshot | null,
	opts?:
	{
		rolls: number;
	},
): void
{
	// Leaving a shared level drops its link from the address, so a reload goes back to the game
	if (S?.lvl === SHARED && i !== SHARED)
	{
		try
		{
			history.replaceState(null, "", location.pathname + location.hash);
		}
		catch
		{
			// A sandboxed page can refuse, and then a reload opens the shared level again
		}
	}
	clearSolution();
	clearHintState();
	$("hintBox").hidden = true;
	if (!(source as Partial<Level>).cells) parseLevel(source);
	const L = source as Level;
	setSession(
		{
			lvl: i,
			L,
			st: initState(L),
			hist: [],
			busy: false,
			won: false,
			rolls: opts?.rolls || 0,
		},
	);
	if (i >= 0) enterCampaignLevel(i);
	if (snap?.st)
	{
		S.st = snap.st;
		S.hist = snap.hist || [];
	}
	queued = null;
	$("win").hidden = true;
	$("lvName").textContent = L.name!;
	$("lvNum").textContent =
		i >= 0
			? `Level ${i + 1} of ${LEVELS.length}`
			: i === -2
				? "Infinite mode"
				: i === SHARED
					? "Shared level"
					: mergeIndex(i) >= 0
						? `Merge level ${mergeIndex(i) + 1} of ${MERGE_LEVELS.length}`
						: "Your level";
	$("lvTip").textContent =
		L.tip ||
		(i === SHARED
			? "Someone shared this level with you."
			: i < 0 && mergeIndex(i) < 0
				? "Testing a level from the editor."
				: "");
	$("par").textContent = domValue(L.par ?? "?");
	$("backEdit").hidden = i !== -1;
	$("winRetry").hidden = false;
	renderInfCard();
	clearTipQueue();
	$("tip").hidden = true;
	if (mode === "play") queueTips(L);
	renderBoard();
	renderLevels();
	renderHud();
	setStatus("");
}

/** The status for a roll refused for reason r. */
export function blockedText(r: MoveFailure, d: Direction): string
{
	if (r.why === "wgate")
		return r.f === "b"
			? `<b>White gate.</b> It needs a bare face down, but rolling ${dirWord(d)} would put ${CNAME[r.has as Paint]} down.`
			: `<b>${cap(FNAME[r.f])} white gate.</b> Your ${FNAME[r.f]} face has to be bare when you land, but it would be ${CNAME[r.has as Paint]}.`;
	if (r.why === "gate")
		return `<b>${cap(CNAME[r.c])} gate.</b> Rolling ${dirWord(d)} would put ${r.down ? CNAME[r.down] : "a bare"} face down.`;
	if (r.why === "door")
	{
		const cn = CNAME[r.c];
		return `<b>${cap(cn)} door is shut.</b> Flip a ${cn} switch or hold down a ${cn} button.`;
	}
	if (r.why === "box")
	{
		const cn = CNAME[r.c];
		return r.c === "w"
			? "<b>White box.</b> Only a completely bare cube can push it."
			: `<b>${cap(cn)} box.</b> Only a cube painted solid ${cn} can push it.`;
	}
	if (r.why === "stuck") return "<b>The box won't budge.</b> Something is in the way on the other side.";
	if (r.why === "misaligned")
		return "<b>Not lined up.</b> A block only takes on a cube straight ahead while lying along that line.";
	if (r.why === "heavy") return "<b>Too clumsy.</b> A block of cubes can't push a box.";
	return "<b>Edge.</b> Nothing to roll onto that way.";
}

export function move(d: Direction): void
{
	if (S.won || tipOpen()) return;
	if (S.busy)
	{
		queued = d;
		return;
	}
	// A level started while this roll animates replaces S, and the roll's end must not land on it
	const session = S;
	const L = S.L;
	const r = tryMove(L, S.st, d);
	if (!r.ok)
	{
		if (r.why === "wgate" || r.why === "gate") pulse(r.nx, r.ny, "deny");
		setStatus(blockedText(r, d), true);
		SFX.play("blocked");
		if (!reduced)
		{
			S.busy = true;
			const settle = (): void =>
			{
				if (S !== session) return;
				S.busy = false;
				flushQueue();
			};
			if (S.st.units)
			{
				void Promise.all(tiltBlock(d, TILT[d]).map(async (a) => a.finished)).then(settle);
				return;
			}
			rollerEl.style.transformOrigin = ORIGIN[d];
			void rollerEl
				.animate(
					[
						{
							transform: "none",
						},
						{
							transform: TILT[d],
						},
						{
							transform: "none",
						},
					],
					{
						duration: 220,
						easing: "ease-out",
					},
				)
				.finished.then(settle);
		}
		return;
	}
	const wasSolid = solidColorOf(S.st);
	const prevOpen = openColors(L, S.st);
	S.hist.push(S.st);
	S.rolls = (S.rolls || 0) + 1;
	let anim: Animation | null = null;
	let blockAnims: Animation[] = [];
	const finish = (): void =>
	{
		if (S !== session) return;
		S.st = r.st;
		placeCube();
		if (anim) anim.cancel();
		blockAnims.forEach((a) =>
		{
			a.cancel();
		});
		renderPieces();
		S.busy = false;
		renderHud(r.painted ? "b" : null);
		if (r.washed)
			document.querySelectorAll("#net .nf").forEach((n) =>
			{
				n.classList.add("pop");
			});
		const solid = solidColorOf(S.st),
			nowOpen = openColors(L, S.st);
		const opened = (Object.keys(nowOpen) as (keyof typeof nowOpen)[]).filter((k) => !prevOpen[k]),
			closed = (Object.keys(prevOpen) as (keyof typeof prevOpen)[]).filter((k) => !nowOpen[k]);
		let msg = "",
			warn = false;
		if (r.painted)
		{
			pulse(r.nx, r.ny, "flash");
			msg = `Painted the bottom face <b>${CNAME[r.painted]}</b>.`;
		}
		if (r.washed)
		{
			pulse(r.nx, r.ny, "flash");
			msg = "<b>Paint removed.</b> Every face is bare again.";
		}
		if (solid && solid !== wasSolid)
			msg = `<b>Solid ${CNAME[solid]}!</b> You can now work ${CNAME[solid]} switches, buttons and boxes.`;
		else if (!solid && wasSolid) msg += ` No longer solid ${CNAME[wasSolid]}.`;
		if (r.flipped >= 0)
		{
			pulse(r.nx, r.ny, "flash");
			msg = `Flipped the ${CNAME[(r.cell as SwitchCell).c]} switch.`;
		}
		if (opened.length)
			msg += ` ${opened.map((k) => cap(CNAME[k])).join(" and ")} door${opened.length > 1 ? "s" : ""} opened.`;
		if (closed.length)
			msg += ` ${closed.map((k) => cap(CNAME[k])).join(" and ")} door${closed.length > 1 ? "s" : ""} closed.`;
		if (r.merged)
		{
			pulse(r.nx, r.ny, "flash");
			msg = `<b>Merged!</b> Your block is ${S.st.units!.length} cubes long now, and rolls as one.`;
		}
		if (r.won) SFX.play("win");
		else if (r.merged) SFX.play("solid");
		else if (r.flipped >= 0) SFX.play("switch");
		else if (solid && solid !== wasSolid) SFX.play("solid");
		else if (r.washed) SFX.play("wash");
		else if (r.painted) SFX.play("paint");
		else if (r.cell.t === "gate") SFX.play("gate");
		else if (r.cell.t === "wgate") SFX.play("wgate");
		if (!r.won)
		{
			if (opened.length)
				setTimeout(() =>
				{
					SFX.play("doorOpen");
				}, 60);
			else if (closed.length)
				setTimeout(() =>
				{
					SFX.play("doorShut");
				}, 60);
			if (!solid && wasSolid) SFX.play("unsolid");
			if (r.goal) SFX.play("blocked");
		}
		if (r.goal && !r.won)
		{
			const onGoal = S.st.units ? judgedGoalFaces(L, S.st.units)! : S.st.f;
			const miss = needEntries(L)
				.filter(([k, v]) => onGoal[k] !== v)
				.map(([k, v]) => `${CNAME[v]} on ${FNAME[k]}`)
				.join(" and ");
			msg = `<b>Not yet.</b> The target needs ${miss}.`;
			warn = true;
		}
		solutionAfterMove(d);
		const hm = hintAfterMove(r);
		if (hm && !warn) msg = (msg + " " + hm).trim();
		setStatus(msg.trim(), warn);
		if (r.won)
		{
			clearHint();
			clearSolution();
			win();
			return;
		}
		flushQueue();
	};
	S.busy = true;
	SFX.play(r.merged ? "push" : "roll");
	if (r.pushed >= 0) SFX.play("push");
	if (reduced)
	{
		finish();
		return;
	}
	if (r.merged)
	{
		// The new cube is already where it ends up, so the block shows merged while it pulses
		S.st = r.st;
		placeCube();
		blockAnims = pulseBlock();
		void Promise.all(blockAnims.map(async (a) => a.finished)).then(finish);
		return;
	}
	const c = C();
	if (r.st.units) aimShadows(r.st.units);
	else shadowEl.style.transform = `translate3d(${r.nx * c + 4}px, ${r.ny * c + 6}px, 0.5px)`;
	if (r.pushed >= 0)
	{
		const b = r.st.boxes[r.pushed]!,
			off = Math.round(c * 0.1);
		boxEls[r.pushed]!.style.transform = `translate3d(${b.x * c + off}px, ${b.y * c + off}px, 1px)`;
	}
	if (S.st.units)
	{
		blockAnims = rollBlock(d, ROT[d]);
		void Promise.all(blockAnims.map(async (a) => a.finished)).then(finish);
		return;
	}
	rollerEl.style.transformOrigin = ORIGIN[d];
	anim = rollerEl.animate(
		[
			{
				transform: "none",
			},
			{
				transform: ROT[d],
			},
		],
		{
			duration: 170,
			easing: "cubic-bezier(.45,.05,.55,.95)",
			fill: "forwards",
		},
	);
	void anim.finished.then(finish);
}
function flushQueue(): void
{
	if (queued)
	{
		const q = queued;
		queued = null;
		move(q);
	}
}

function win(): void
{
	S.won = true;
	const L = S.L,
		m = S.hist.length;
	if (S.lvl === -2)
	{
		infWin();
		$("win").hidden = false;
		setStatus("<b>Cleared.</b>");
		$("winNext").focus(
			{
				preventScroll: true,
			},
		);
		return;
	}
	const merge = mergeIndex(S.lvl);
	const custom = S.lvl < 0 && merge < 0;
	if (!custom) recordWin(L, m);
	renderLevels();
	const last = S.lvl === LEVELS.length - 1 || merge === MERGE_LEVELS.length - 1;
	const card = winCard(
		{
			kind: S.lvl === SHARED ? "shared" : custom ? "custom" : merge >= 0 ? "merge" : "campaign",
			last,
			moves: m,
			par: L.par,
			usedSolution: S.usedSolution,
		},
	);
	$("winTitle").textContent = card.title;
	$("winScore").textContent = card.score;
	$("winNote").textContent = card.note;
	$("winNext").hidden = card.nextHidden;
	$("winNext").firstChild!.textContent = card.next;
	$("win").hidden = false;
	setStatus("<b>Cleared.</b>");
	(last && !custom ? $("winRetry") : $("winNext")).focus(
		{
			preventScroll: true,
		},
	);
}

export function undo(): void
{
	if (S.busy || S.won || !S.hist.length) return;
	forgetHintPosition();
	const keep = solState ? solState.revealed + 1 : 0;
	S.st = S.hist.pop()!;
	SFX.play("undo");
	placeCube();
	renderPieces(true);
	renderHud();
	setStatus("Undid one roll.");
	if (keep)
	{
		stopAutoReveal();
		planSolution(keep);
	}
}
export const restart = (): void =>
{
	startLevel(
		S.L,
		S.lvl,
		null,
		{
			rolls: S.lvl === -2 ? S.rolls : 0,
		},
	);
};
