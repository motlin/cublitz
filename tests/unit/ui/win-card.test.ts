import {expect, test} from "vite-plus/test";
import {type WinCardInput, winCard} from "../../../src/ui/win-card.ts";

const campaign = (input: Partial<WinCardInput>): WinCardInput => (
{
	kind: "campaign",
	last: false,
	moves: 6,
	par: 6,
	usedSolution: false,
	...input,
});

test("a campaign win at par is a perfect roll, and the last level says so and hides Next", () =>
{
	expect([
		winCard(campaign({})),
		winCard(
			campaign(
				{
					last: true,
					moves: 67,
					par: 67,
				},
			),
		),
	]).toStrictEqual([
		{
			title: "Perfect roll",
			score: "6 moves · par 6",
			note: "You matched the shortest solution.",
			nextHidden: false,
			next: "Next level ",
		},
		{
			title: "Perfect roll",
			score: "67 moves · par 67",
			note: "That was the last canvas. Replay any level to chase par, or build your own in the editor.",
			nextHidden: true,
			next: "Next level ",
		},
	]);
});

test("a campaign win over par, or with the solution, says how to do better", () =>
{
	expect([
		winCard(
			campaign(
				{
					moves: 9,
				},
			),
		),
		winCard(
			campaign(
				{
					usedSolution: true,
				},
			),
		),
	]).toStrictEqual([
		{
			title: "Dry and done",
			score: "9 moves · par 6",
			note: "Par is 6. Replay to tighten it up.",
			nextHidden: false,
			next: "Next level ",
		},
		{
			title: "Solved",
			score: "6 moves · par 6",
			note: "You followed the solution this time. Replay it from memory when you are ready.",
			nextHidden: false,
			next: "Next level ",
		},
	]);
});

test("editor, shared-link and merge wins each have their own note and Next button", () =>
{
	expect([
		winCard(
			{
				kind: "custom",
				last: false,
				moves: 4,
				par: undefined,
				usedSolution: false,
			},
		),
		winCard(
			{
				kind: "shared",
				last: false,
				moves: 4,
				par: 4,
				usedSolution: false,
			},
		),
		winCard(
			{
				kind: "merge",
				last: false,
				moves: 5,
				par: 5,
				usedSolution: false,
			},
		),
		winCard(
			{
				kind: "merge",
				last: true,
				moves: 5,
				par: 5,
				usedSolution: false,
			},
		),
	]).toStrictEqual([
		{
			title: "Dry and done",
			score: "4 moves",
			note: "Your level works. Head back to the editor to tweak or save it.",
			nextHidden: false,
			next: "Back to editor ",
		},
		{
			title: "Perfect roll",
			score: "4 moves · par 4",
			note: "You cleared a shared level. Keep rolling in the main game.",
			nextHidden: false,
			next: "Play the game ",
		},
		{
			title: "Perfect roll",
			score: "5 moves · par 5",
			note: "You matched the shortest solution.",
			nextHidden: false,
			next: "Next level ",
		},
		{
			title: "Perfect roll",
			score: "5 moves · par 5",
			note: "That was the last merge level. Replay any of them to chase par.",
			nextHidden: true,
			next: "Next level ",
		},
	]);
});
