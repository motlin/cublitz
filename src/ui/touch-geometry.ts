import type {Direction} from "../core/types.ts";
import type {CameraMove} from "./gestures.ts";

// What the board's CSS transform does to the grid, for a touch screen to fit the board and read swipes by what is
// drawn. These are the numbers in .board and .viewport in game.css.
const TILT_X = (52 * Math.PI) / 180;
const TILT_Z = (18 * Math.PI) / 180;
const PERSPECTIVE = 1400;
const MAX_CELL = 62;
const MIN_CELL = 4;
const MARGIN = 8;

/** A point on the board, from the board's centre, as it lands on screen from the viewport's centre. */
function project(x: number, y: number, z: number): [number, number]
{
	const flatX = x * Math.cos(TILT_Z) - y * Math.sin(TILT_Z);
	const flatY = x * Math.sin(TILT_Z) + y * Math.cos(TILT_Z);
	const screenY = flatY * Math.cos(TILT_X) - z * Math.sin(TILT_X);
	const depth = flatY * Math.sin(TILT_X) + z * Math.cos(TILT_X);
	const scale = PERSPECTIVE / (PERSPECTIVE - depth);
	return [flatX * scale, screenY * scale];
}

const DIRECTIONS: [Direction, number, number][] = [
	["E", 1, 0],
	["S", 0, 1],
	["W", -1, 0],
	["N", 0, -1],
];

const screenAngle = (x: number, y: number): number =>
{
	const [px, py] = project(x, y, 0);
	return (Math.atan2(py, px) * 180) / Math.PI;
};

/** The on-screen angle of each roll, in degrees. */
export function gridAxes(): Record<Direction, number>
{
	return {
		E: screenAngle(1, 0),
		S: screenAngle(0, 1),
		W: screenAngle(-1, 0),
		N: screenAngle(0, -1),
	};
}

/** The roll whose drawn axis is nearest the direction a finger moved. */
export function swipeAxis(dx: number, dy: number): Direction
{
	let best: Direction = "E";
	let bestScore = -Infinity;
	for (const [d, x, y] of DIRECTIONS)
	{
		const [px, py] = project(x, y, 0);
		const score = (dx * px + dy * py) / Math.hypot(px, py);
		if (score > bestScore)
		{
			bestScore = score;
			best = d;
		}
	}
	return best;
}

export type BoardFit =
{
	cell: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
};

/**
 * The largest tile size that keeps the whole level inside an area, with room above it for a block as tall as every
 * cube on the level stacked, since merged cubes can stand as a tower.
 */
export function fitBoard(cols: number, rows: number, areaWidth: number, areaHeight: number, cubes = 1): BoardFit
{
	if (!areaWidth || !areaHeight)
		return {
			cell: 24,
			width: 0,
			height: 0,
			centerX: 0,
			centerY: 0,
		};
	let fit: BoardFit =
	{
		cell: MIN_CELL,
		width: 0,
		height: 0,
		centerX: 0,
		centerY: 0,
	};
	for (let cell = MAX_CELL; cell >= MIN_CELL; cell--)
	{
		const halfW = (cols * cell) / 2,
			halfH = (rows * cell) / 2;
		const corners = [-halfW, halfW].flatMap((x) =>
			[-halfH, halfH].flatMap((y) => [0, cubes * cell].map((z) => project(x, y, z))),
		);
		const xs = corners.map(([x]) => x),
			ys = corners.map(([, y]) => y);
		const left = Math.min(...xs),
			right = Math.max(...xs),
			top = Math.min(...ys),
			bottom = Math.max(...ys);
		fit =
		{
			cell,
			width: right - left,
			height: bottom - top,
			centerX: (left + right) / 2,
			centerY: (top + bottom) / 2,
		};
		if (fit.width <= areaWidth - MARGIN * 2 && fit.height <= areaHeight - MARGIN * 2) break;
	}
	return fit;
}

export type Camera =
{
	zoom: number;
	x: number;
	y: number;
};
type Area =
{
	width: number;
	height: number;
};

const MAX_ZOOM = 5;
const PAN_SLACK = 16;

/** The camera after one step of two fingers over the board's area, keeping the spot between them under them. */
export function stepCamera(
	camera: Camera,
	{ratio, dx, dy, x, y}: CameraMove,
	view: Area &
	{
		left: number;
		top: number;
	},
): Camera
{
	const zoom = Math.max(1, Math.min(MAX_ZOOM, camera.zoom * ratio));
	const scale = zoom / camera.zoom;
	const fromX = x - view.left - view.width / 2,
		fromY = y - view.top - view.height / 2;
	return {
		zoom,
		x: fromX - (fromX - camera.x) * scale + dx,
		y: fromY - (fromY - camera.y) * scale + dy,
	};
}

/** The camera held where some of the fitted board stays in its area, and centred at the fit. */
export function clampCamera(camera: Camera, fit: Area, area: Area): Camera
{
	if (camera.zoom <= 1)
		return {
			zoom: camera.zoom,
			x: 0,
			y: 0,
		};
	const limitX = Math.max(0, (fit.width * camera.zoom - area.width) / 2 + PAN_SLACK);
	const limitY = Math.max(0, (fit.height * camera.zoom - area.height) / 2 + PAN_SLACK);
	return {
		zoom: camera.zoom,
		x: Math.max(-limitX, Math.min(limitX, camera.x)),
		y: Math.max(-limitY, Math.min(limitY, camera.y)),
	};
}
