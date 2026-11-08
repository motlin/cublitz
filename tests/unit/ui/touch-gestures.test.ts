import {afterEach, beforeEach, describe, expect, it, vi} from "vite-plus/test";
import type {Direction} from "../../../src/core/types.ts";
import {TOUCH_PINCH_GRACE, touchGridCell, touchGridZoom} from "../../../src/ui/editor-grid.ts";
import {fingerGestures, type Gestures} from "../../../src/ui/gestures.ts";
import {type Camera, clampCamera, fitBoard, stepCamera, swipeAxis} from "../../../src/ui/touch-geometry.ts";

// The finger tracks of the browser's touch-gestures spec, played through the same gesture reading and camera math
// without the page. Each finger list is one touch event, as the browser harness sends it, and the camera reads the
// fingers once after each event, as a frame would.

type Finger =
{
	id: number;
	x: number;
	y: number;
	/** It landed off the surface, on the status line or the header. */
	off?: boolean;
};
type Step = Finger[] | number;
type Point = [x: number, y: number];

/** The board's area on each screen the browser spec runs on, measured there with level 16 open, and the editor's tile
 * size that fits its grid. */
const SCREENS = [
	{
		name: "320x568 portrait",
		width: 320,
		view:
		{
			left: 0,
			top: 99,
			width: 320,
			height: 275,
		},
		editorCell: 32,
	},
	{
		name: "320x568 landscape",
		width: 568,
		view:
		{
			left: 0,
			top: 91,
			width: 342,
			height: 197,
		},
		editorCell: 37,
	},
	{
		name: "360x640 portrait",
		width: 360,
		view:
		{
			left: 0,
			top: 91,
			width: 360,
			height: 355,
		},
		editorCell: 37,
	},
	{
		name: "360x640 landscape",
		width: 640,
		view:
		{
			left: 0,
			top: 91,
			width: 414,
			height: 237,
		},
		editorCell: 45,
	},
	{
		name: "390x844 portrait",
		width: 390,
		view:
		{
			left: 0,
			top: 91,
			width: 390,
			height: 559,
		},
		editorCell: 41,
	},
	{
		name: "390x844 landscape",
		width: 844,
		view:
		{
			left: 0,
			top: 91,
			width: 618,
			height: 267,
		},
		editorCell: 51,
	},
];
type Screen = (typeof SCREENS)[number];

const FIT_CAMERA: Camera =
{
	zoom: 1,
	x: 0,
	y: 0,
};

/** Fingers landing in one event, moving together in the given steps, then lifting, as the harness's together does. */
function together(paths: [Point, Point][], steps = 10, gap = 12): Step[]
{
	const at = (t: number): Finger[] =>
		paths.map(([from, to], i) => (
		{
			id: i + 1,
			x: from[0] + (to[0] - from[0]) * t,
			y: from[1] + (to[1] - from[1]) * t,
		}));
	const moves = Array.from(
		{
			length: steps,
		},
		(_, i) => [gap, at((i + 1) / steps)],
	);
	return [at(0), ...moves.flat(), 150, [], 60];
}

/** A finger script as the harness's fingerScript plays it, with its pause after each event. */
const script = (steps: Step[]): Step[] => [
	...steps.flatMap((step) => (typeof step === "number" ? [step] : [step, 12])),
	40,
];

const pointer = ({id, x, y}: Finger) => (
{
	pointerId: id,
	clientX: x,
	clientY: y,
});

/** Plays the steps through a surface: each list of fingers is one touch event, and each number is a wait. */
function play(g: Gestures, frames: (() => void)[], steps: Step[]): void
{
	let down: Finger[] = [];
	for (const step of steps)
	{
		if (typeof step === "number")
		{
			vi.advanceTimersByTime(step);
			continue;
		}
		for (const finger of down)
		{
			const now = step.find(({id}) => id === finger.id);
			if (!now) g.up(pointer(finger));
			else if (now.x !== finger.x || now.y !== finger.y) g.move(pointer(now));
		}
		for (const finger of step)
			if (!down.some(({id}) => id === finger.id)) g.down(pointer(finger), finger.off ?? false);
		down = step;
		for (const run of frames.splice(0)) run();
	}
}

/** The board of level 16 on a screen, with the camera and rolls that the play surface would make of the fingers. */
function playBoard(screen: Screen)
{
	const {view} = screen;
	const fit = fitBoard(17, 4, view.width, view.height, 1);
	const frames: (() => void)[] = [];
	const board =
	{
		camera: FIT_CAMERA,
		rolls: [] as Direction[],
		cx: view.left + view.width / 2,
		cy: view.top + view.height / 2,
		/** How far inside the board's area its right edge stops. */
		rightGap: () => Math.round(view.width / 2 - board.camera.x - (fit.width * board.camera.zoom) / 2),
		zoom: () => Math.round(board.camera.zoom * 100) / 100,
		play: (steps: Step[]) =>
		{
			play(g, frames, steps);
		},
	};
	const g = fingerGestures(
		{
			swipe: (dx, dy) =>
			{
				board.rolls.push(swipeAxis(dx, dy));
			},
			camera: (move) =>
			{
				board.camera = clampCamera(stepCamera(board.camera, move, view), fit, view);
			},
			doubleTap: () =>
			{
				board.camera = FIT_CAMERA;
			},
		},
		{
			frame: (run) =>
			{
				frames.push(run);
			},
		},
	);
	return board;
}

/** The editor's grid on a screen: what the fingers did and the tile size its zoom reaches. */
function editorGrid(screen: Screen)
{
	const fit = screen.editorCell;
	const frames: (() => void)[] = [];
	const grid =
	{
		zoom: 1,
		events: [] as string[],
		cell: () => touchGridCell(fit, grid.zoom),
		play: (steps: Step[]) =>
		{
			play(g, frames, steps);
		},
	};
	const g = fingerGestures(
		{
			press: () => grid.events.push("press"),
			drag: () => grid.events.push("drag"),
			cameraStart: () => grid.events.push("cameraStart"),
			camera: ({ratio}) =>
			{
				grid.zoom = touchGridZoom(grid.zoom, ratio, fit);
			},
		},
		{
			eagerCamera: true,
			together: TOUCH_PINCH_GRACE,
			frame: (run) =>
			{
				frames.push(run);
			},
		},
	);
	return grid;
}

/** One finger lands, then a second 15ms later, and they spread apart along y. */
const editorPinch = (first: Finger, second: Finger, firstDy: number): Step[] =>
	script([
		[first],
		15,
		[first, second],
		...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => [
			{
				...first,
				y: first.y + i * 6 * firstDy,
			},
			{
				...second,
				y: second.y - i * 6 * firstDy,
			},
		]),
		[],
	]);

describe.each(SCREENS)("$name", (screen) =>
{
	beforeEach(() =>
	{
		vi.useFakeTimers();
	});
	afterEach(() =>
	{
		vi.useRealTimers();
	});

	it("a pinch across the board's edge zooms and rolls nothing, whichever finger is on the board", () =>
	{
		const {view} = screen;
		const cx = view.left + view.width / 2;
		const bottom = view.top + view.height;
		const statusY = bottom + 30;
		const headY = view.top - 30;
		const cases: Record<string, [Point, Point, boolean][]> =
		{
			"board then status": [
				[[cx, bottom - 30], [cx - 30, bottom - 110], false],
				[[cx + 20, statusY], [cx + 50, statusY + 30], true],
			],
			"status then board": [
				[[cx + 20, statusY], [cx + 50, statusY + 30], true],
				[[cx, bottom - 30], [cx - 30, bottom - 110], false],
			],
			"board then header": [
				[[cx, view.top + 30], [cx + 30, view.top + 110], false],
				[[cx + 60, headY], [cx + 90, Math.max(2, headY - 40)], true],
			],
		};
		const report = Object.fromEntries(
			Object.entries(cases).map(([name, paths]) =>
			{
				const board = playBoard(screen);
				const offIds = new Set(paths.flatMap(([, , off], i) => (off ? [i + 1] : [])));
				board.play(
					together(paths.map(([from, to]) => [from, to])).map((step) =>
						typeof step === "number"
							? step
							: step.map((finger) => (
								{
									...finger,
									off: offIds.has(finger.id),
								})),
					),
				);
				return [
					name,
					{
						rolls: board.rolls,
						zoomed: board.camera.zoom > 1,
					},
				];
			}),
		);
		const clean =
		{
			rolls: [],
			zoomed: true,
		};
		expect(report).toStrictEqual(
			{
				"board then status": clean,
				"status then board": clean,
				"board then header": clean,
			},
		);
	});

	it("a pinch with one finger held still or drifting zooms and rolls nothing", () =>
	{
		const report: Record<string, unknown> = {};
		for (const [name, drift] of [
			["still", 0],
			["drifting", 8],
		] as const)
		{
			const board = playBoard(screen);
			const {cx, cy} = board;
			board.play(
				together(
					[
						[
							[cx - 40, cy],
							[cx - 40 - drift, cy],
						],
						[
							[cx + 10, cy],
							[cx + 90, cy],
						],
					],
					12,
				),
			);
			report[name] =
			{
				rolls: board.rolls,
				zoom: board.zoom(),
			};
		}
		expect(report).toStrictEqual(
			{
				still:
				{
					rolls: [],
					zoom: 2.6,
				},
				drifting:
				{
					rolls: [],
					zoom: 2.76,
				},
			},
		);
	});

	it("a thumb resting since before the swipe still does not block it, even if it jitters", () =>
	{
		const board = playBoard(screen);
		const {cx, cy} = board;
		const thumb = (dx: number): Finger => (
		{
			id: 2,
			x: cx + 90 + dx,
			y: cy + 40,
		});
		const up = (i: number): Finger => (
		{
			id: 1,
			x: cx,
			y: cy + 20 - i * 12,
		});
		board.play(
			script([
				[thumb(0)],
				250,
				[thumb(0), up(0)],
				[thumb(4), up(1)],
				[thumb(7), up(2)],
				[thumb(5), up(3)],
				[thumb(8), up(4)],
				[thumb(8)],
				[],
			]),
		);
		expect(
			{
				rolls: board.rolls,
				camera: board.camera,
			},
		).toStrictEqual(
			{
				rolls: ["N"],
				camera: FIT_CAMERA,
			},
		);
	});

	it("a rigid two-finger pan never changes the zoom, at the fit or at the most zoomed", () =>
	{
		const board = playBoard(screen);
		const {cx, cy} = board;
		const pan = (spacing: number, by: number, steps: number, flip = false) =>
		{
			const a: [Point, Point] = [
				[cx, cy],
				[cx + by, cy],
			];
			const b: [Point, Point] = [
				[cx + spacing, cy],
				[cx + spacing + by, cy],
			];
			board.play(together(flip ? [b, a] : [a, b], steps));
		};
		pan(120, -50, 8);
		pan(80, 50, 8, true);
		pan(80, 0, 1);
		const atFit = board.camera;
		for (let i = 0; i < 3; i++)
			board.play(
				together(
					[
						[
							[cx - 20, cy],
							[Math.max(2, cx - 150), cy],
						],
						[
							[cx + 20, cy],
							[Math.min(screen.width - 2, cx + 150), cy],
						],
					],
					10,
				),
			);
		const most = board.camera.zoom;
		for (let i = 0; i < 6; i++) pan(60, i % 2 ? 100 : -100, 3, i % 3 === 0);
		expect(
			{
				"at fit": atFit,
				"reached the most": most,
				"after pans": board.camera.zoom,
				rolls: board.rolls,
			},
		).toStrictEqual(
			{
				"at fit": FIT_CAMERA,
				"reached the most": 5,
				"after pans": 5,
				rolls: [],
			},
		);
	});

	it("a two-finger pan whose spacing wobbles a little stays a pan", () =>
	{
		const board = playBoard(screen);
		const {cx, cy} = board;
		const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
			{
				id: 1,
				x: cx - 40 - i * 5,
				y: cy,
			},
			{
				id: 2,
				x: cx + 40 - i * 5 + (i % 2 ? 4 : 0),
				y: cy,
			},
		]);
		board.play(script([...frames.flatMap((frame) => [frame, 20]), []]));
		expect(
			{
				camera: board.camera,
				rolls: board.rolls,
			},
		).toStrictEqual(
			{
				camera: FIT_CAMERA,
				rolls: [],
			},
		);
	});

	it("a fast two-finger pan at low zoom moves the board its whole way, in either finger order", () =>
	{
		const report: Record<string, unknown> = {};
		for (const flip of [false, true])
		{
			const board = playBoard(screen);
			const {cx, cy} = board;
			board.play(
				together([
					[
						[cx - 30, cy],
						[cx - 75, cy],
					],
					[
						[cx + 30, cy],
						[cx + 75, cy],
					],
				]),
			);
			const a: [Point, Point] = [
				[cx + 20, cy],
				[cx - 40, cy],
			];
			const b: [Point, Point] = [
				[cx + 70, cy],
				[cx + 10, cy],
			];
			const before = board.camera;
			board.play(together(flip ? [b, a] : [a, b], 6, 14));
			report[flip ? "flipped" : "plain"] =
			{
				moved: Math.round(board.camera.x - before.x),
				zoom: board.zoom(),
			};
		}
		expect(report).toStrictEqual(
			{
				plain:
				{
					moved: -60,
					zoom: 2.5,
				},
				flipped:
				{
					moved: -60,
					zoom: 2.5,
				},
			},
		);
	});

	it("the pan stops with the board's far edge still in view", () =>
	{
		const board = playBoard(screen);
		const {cx, cy} = board;
		board.play(
			together([
				[
					[cx - 30, cy],
					[cx - 90, cy],
				],
				[
					[cx + 30, cy],
					[cx + 90, cy],
				],
			]),
		);
		for (let i = 0; i < 8; i++)
			board.play(
				together([
					[
						[cx + 40, cy],
						[cx - 40, cy],
					],
					[
						[cx + 90, cy],
						[cx + 10, cy],
					],
				]),
			);
		expect(
			{
				zoom: board.zoom(),
				rightGap: board.rightGap(),
			},
		).toStrictEqual(
			{
				zoom: 3,
				rightGap: 16,
			},
		);
	});

	it("the editor takes a pinch with one finger off the grid, whichever landed first", () =>
	{
		const [ax, ay] = [100, 120];
		const offY = ay + 80;
		const gridFirst = editorGrid(screen);
		gridFirst.play(
			editorPinch(
				{
					id: 1,
					x: ax,
					y: ay,
				},
				{
					id: 2,
					x: ax,
					y: offY,
					off: true,
				},
				-1,
			),
		);
		const offFirst = editorGrid(screen);
		offFirst.play(
			editorPinch(
				{
					id: 1,
					x: ax,
					y: offY,
					off: true,
				},
				{
					id: 2,
					x: ax,
					y: ay,
				},
				1,
			),
		);
		expect(
			{
				"grid first":
				{
					events: gridFirst.events,
					cell: gridFirst.cell(),
				},
				"off first":
				{
					events: offFirst.events,
					cell: offFirst.cell(),
				},
			},
		).toStrictEqual(
			{
				"grid first":
				{
					events: ["press", "cameraStart"],
					cell: 56,
				},
				"off first":
				{
					events: ["cameraStart"],
					cell: 56,
				},
			},
		);
	});

	it("a second finger on the grid stops the paint as it lands, however late", () =>
	{
		const grid = editorGrid(screen);
		const a: Finger =
		{
			id: 1,
			x: 40,
			y: 100,
		};
		const b: Finger =
		{
			id: 2,
			x: 200,
			y: 100,
		};
		grid.play(
			script([
				[a],
				600,
				[a, b],
				[
					{
						...a,
						x: 120,
					},
					b,
				],
				[],
			]),
		);
		expect(grid.events).toStrictEqual(["press", "cameraStart"]);
	});

	it("a slow pinch on the editor's grid zooms as far as a quick one", () =>
	{
		const pinchBy = (steps: number, gap: number): number =>
		{
			const grid = editorGrid(screen);
			grid.play(
				together(
					[
						[
							[160, 300],
							[150, 300],
						],
						[
							[220, 300],
							[230, 300],
						],
					],
					steps,
					gap,
				),
			);
			return grid.cell();
		};
		const wanted = Math.min(56, Math.round((screen.editorCell * 80) / 60));
		expect(
			{
				slow: pinchBy(40, 20),
				quick: pinchBy(2, 12),
			},
		).toStrictEqual(
			{
				slow: wanted,
				quick: wanted,
			},
		);
	});
});
