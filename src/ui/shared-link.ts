import {initState, parseLevel} from "../core/level.ts";
import {levelFromSearch} from "../core/share.ts";
import {solve} from "../core/solver.ts";
import type {LevelSource} from "../core/types.ts";
import {$, domValue} from "./dom.ts";
import {setMode} from "./modes.ts";
import {SHARED, startLevel} from "./play.ts";
import {S} from "./session.ts";

function showBadLink(): void
{
	const note = document.createElement("p");
	note.id = "shareError";
	note.className = "ed-result bad";
	note.setAttribute("role", "alert");
	note.innerHTML = "<b>This level link didn’t work.</b> It may be incomplete, so ask for a new one.";
	$("titleProgress").before(note);
}

/** Plays the level in a link's raw query. A broken link stays on the title screen and says so. */
export function openSharedLink(search: string): void
{
	let source: LevelSource | null;
	try
	{
		source = levelFromSearch(search);
	}
	catch
	{
		showBadLink();
		return;
	}
	if (!source) return;
	const L = parseLevel(source);
	L.par = null;
	startLevel(L, SHARED);
	setMode("play");
	// A big level can take seconds to solve, so the board paints first with par unknown.
	setTimeout(() =>
	{
		const sol = solve(L, initState(L), 600000);
		L.par = sol ? sol.length : null;
		if (S.L === L) $("par").textContent = domValue(L.par ?? "?");
	});
}
