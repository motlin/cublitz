// What fingers on a touch screen mean, without the page. Two fingers that land together, or that both move, are the
// camera, wherever on the screen the second one is. Otherwise one moving finger on the surface is a swipe, and a finger
// that has been down and still is resting, so a thumb on the screen neither blocks nor bends it.

export type FingerEvent =
{
	pointerId: number;
	clientX: number;
	clientY: number;
};
export type CameraMove =
{
	ratio: number;
	dx: number;
	dy: number;
	x: number;
	y: number;
};

type Handlers =
{
	/** A first finger touched down. */
	press?: (e: FingerEvent) => void;
	/** The only finger in play moved. */
	drag?: (e: FingerEvent) => void;
	/** Past the swipe distance, this is the swipe so far; null when it is not one any more. */
	aim?: (swipe: [number, number] | null) => void;
	swipe?: (dx: number, dy: number) => void;
	cameraStart?: () => void;
	camera?: (move: CameraMove) => void;
	doubleTap?: () => void;
};

type Finger =
{
	id: number;
	startX: number;
	startY: number;
	x: number;
	y: number;
	moved: boolean;
	at: number;
	/** It landed off the surface: it can make a pair for the camera but never acts alone. */
	foreign: boolean;
};

const RESTING = 10;
/** Fingers landing this close together are one gesture, however little one of them then moves. */
const TOGETHER = 150;
/** The spacing has to change this much before two fingers are pinching, so a rigid pan never zooms. */
const PINCH_SLOP = 8;
const SWIPE = 24;
const TAP_GAP = 320;
const TAP_NEAR = 30;

export type Gestures =
{
	down: (e: FingerEvent, foreign?: boolean) => void;
	move: (e: FingerEvent) => void;
	up: (e: FingerEvent) => void;
	cancel: (e: FingerEvent) => void;
};

type Options =
{
	/** A second finger on the surface takes the camera as it lands, for a surface whose first finger acts at once. */
	eagerCamera?: boolean;
	together?: number;
	/** The camera reads the fingers once a frame, since each finger's event arrives alone and the spacing between two
	 * such events is not one the fingers ever had. */
	frame?: (run: () => void) => void;
};

export function fingerGestures(
	on: Handlers,
	{eagerCamera = false, together = TOGETHER, frame = requestAnimationFrame}: Options = {},
): Gestures
{
	const fingers = new Map<number, Finger>();
	let camera = false;
	let last:
	{
		dist: number;
		x: number;
		y: number;
		pair: string;
		pinching: boolean;
	} | null = null;
	let lastTap:
	{
		at: number;
		x: number;
		y: number;
	} | null = null;
	let stepDue = false;

	const cameraStep = (): void =>
	{
		stepDue = false;
		const live = [...fingers.values()];
		const moved = live.filter((finger) => finger.moved);
		const [a, b] = (moved.length >= 2 ? moved : live).slice(0, 2);
		if (!a || !b)
		{
			last = null;
			return;
		}
		const pair = `${a.id},${b.id}`;
		const dist = Math.hypot(a.x - b.x, a.y - b.y),
			x = (a.x + b.x) / 2,
			y = (a.y + b.y) / 2;
		if (!last || last.pair !== pair)
		{
			last =
			{
				dist,
				x,
				y,
				pair,
				pinching: false,
			};
			return;
		}
		if (Math.abs(dist - last.dist) >= PINCH_SLOP) last.pinching = true;
		const ratio = last.pinching && last.dist > 0 ? dist / last.dist : 1;
		on.camera?.(
			{
				ratio,
				dx: x - last.x,
				dy: y - last.y,
				x,
				y,
			},
		);
		last =
		{
			dist: last.pinching ? dist : last.dist,
			x,
			y,
			pair,
			pinching: last.pinching,
		};
	};
	const flush = (): void =>
	{
		if (stepDue) cameraStep();
	};
	const enterCamera = (): void =>
	{
		camera = true;
		last = null;
		on.aim?.(null);
		on.cameraStart?.();
		cameraStep();
	};
	const leaveIfEmpty = (): void =>
	{
		if (fingers.size === 0)
		{
			camera = false;
			last = null;
		}
	};
	const reach = (finger: Finger): number => Math.hypot(finger.x - finger.startX, finger.y - finger.startY);
	/** Whether a finger landing now makes a pair with one already down. */
	const pairs = (others: Finger[], foreign: boolean, now: number): boolean =>
		others.some((other) =>
		{
			if (foreign && other.foreign) return false;
			if (eagerCamera && !foreign && !other.foreign) return true;
			return now - other.at < together && (eagerCamera || !other.moved);
		});

	return {
		down(e, foreign = false)
		{
			flush();
			const now = performance.now();
			const others = [...fingers.values()];
			fingers.set(
				e.pointerId,
				{
					id: e.pointerId,
					startX: e.clientX,
					startY: e.clientY,
					x: e.clientX,
					y: e.clientY,
					moved: false,
					at: now,
					foreign,
				},
			);
			last = null;
			if (camera) cameraStep();
			else if (others.length && pairs(others, foreign, now)) enterCamera();
			else if (!foreign && !others.some((other) => !other.foreign)) on.press?.(e);
		},
		move(e)
		{
			const finger = fingers.get(e.pointerId);
			if (!finger) return;
			finger.x = e.clientX;
			finger.y = e.clientY;
			if (!finger.moved && reach(finger) >= RESTING) finger.moved = true;
			if (!camera)
			{
				const live = [...fingers.values()];
				if (live.filter((f) => f.moved).length >= 2 && live.some((f) => !f.foreign))
				{
					enterCamera();
					return;
				}
			}
			if (camera)
			{
				if (!stepDue)
				{
					stepDue = true;
					frame(flush);
				}
				return;
			}
			if (!finger.moved || finger.foreign) return;
			on.drag?.(e);
			on.aim?.(reach(finger) >= SWIPE ? [finger.x - finger.startX, finger.y - finger.startY] : null);
		},
		up(e)
		{
			const finger = fingers.get(e.pointerId);
			if (!finger) return;
			finger.x = e.clientX;
			finger.y = e.clientY;
			flush();
			fingers.delete(e.pointerId);
			last = null;
			if (!camera && !finger.foreign)
			{
				on.aim?.(null);
				if (finger.moved && reach(finger) >= SWIPE)
					on.swipe?.(finger.x - finger.startX, finger.y - finger.startY);
				else if (!finger.moved && fingers.size === 0)
				{
					const now = performance.now();
					if (
						lastTap &&
						now - lastTap.at < TAP_GAP &&
						Math.hypot(finger.x - lastTap.x, finger.y - lastTap.y) < TAP_NEAR
					)
					{
						lastTap = null;
						on.doubleTap?.();
					}
					else
						lastTap =
						{
							at: now,
							x: finger.x,
							y: finger.y,
						};
				}
			}
			leaveIfEmpty();
		},
		cancel(e)
		{
			const finger = fingers.get(e.pointerId);
			if (!finger) return;
			flush();
			fingers.delete(e.pointerId);
			last = null;
			if (!camera && !finger.foreign) on.aim?.(null);
			leaveIfEmpty();
		},
	};
}
