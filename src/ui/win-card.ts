// What the win card says once a level is cleared, apart from infinite mode, which has its own card.

/** custom is a level played from the editor; last is the last campaign level or the last merge level. */
export type WinCardInput =
{
	kind: "campaign" | "merge" | "custom" | "shared";
	last: boolean;
	moves: number;
	par: number | null | undefined;
	usedSolution: boolean | undefined;
};
export type WinCard =
{
	title: string;
	score: string;
	note: string;
	nextHidden: boolean;
	next: string;
};

function winNote({kind, last, moves, par, usedSolution}: WinCardInput): string
{
	if (kind === "shared") return "You cleared a shared level. Keep rolling in the main game.";
	if (kind === "custom") return "Your level works. Head back to the editor to tweak or save it.";
	if (kind === "merge" && last) return "That was the last merge level. Replay any of them to chase par.";
	if (last) return "That was the last canvas. Replay any level to chase par, or build your own in the editor.";
	if (usedSolution) return "You followed the solution this time. Replay it from memory when you are ready.";
	return moves <= par! ? "You matched the shortest solution." : `Par is ${par}. Replay to tighten it up.`;
}

export function winCard(input: WinCardInput): WinCard
{
	const {kind, last, moves, par, usedSolution} = input;
	const ownLevel = kind === "custom" || kind === "shared";
	return {
		title: usedSolution ? "Solved" : par && moves <= par ? "Perfect roll" : "Dry and done",
		score: par ? `${moves} moves · par ${par}` : `${moves} moves`,
		note: winNote(input),
		nextHidden: last && !ownLevel,
		next: kind === "shared" ? "Play the game " : kind === "custom" ? "Back to editor " : "Next level ",
	};
}
