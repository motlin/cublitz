import {afterEach, beforeEach, describe, expect, it, vi} from "vite-plus/test";
import {type CameraMove, fingerGestures} from "../../../src/ui/gestures.ts";

type Log = (string | CameraMove)[];

const at = (pointerId: number, clientX: number, clientY: number) => ({pointerId, clientX, clientY});

function setup(eagerCamera = false) {
	const log: Log = [];
	const g = fingerGestures(
		{
			press: () => log.push("press"),
			drag: () => log.push("drag"),
			swipe: (dx, dy) => log.push(`swipe ${dx},${dy}`),
			cameraStart: () => log.push("cameraStart"),
			camera: (move) => log.push(move),
			doubleTap: () => log.push("doubleTap"),
		},
		{
			eagerCamera,
			frame: (run) => {
				run();
			},
		},
	);
	return {log, g};
}

describe("fingerGestures", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("makes one moved finger a swipe measured from its own start", () => {
		const {log, g} = setup();
		g.down(at(1, 100, 100));
		g.move(at(1, 100, 60));
		g.up(at(1, 100, 60));
		expect(log).toStrictEqual(["press", "drag", "swipe 0,-40"]);
	});

	it("ignores a resting finger, whichever lifts first", () => {
		const {log, g} = setup();
		g.down(at(2, 300, 300));
		vi.advanceTimersByTime(200);
		g.down(at(1, 100, 100));
		g.move(at(1, 100, 60));
		g.up(at(2, 300, 300));
		g.up(at(1, 100, 60));
		expect(log).toStrictEqual(["press", "drag", "swipe 0,-40"]);
	});

	it("cancels a swipe dragged back near its start", () => {
		const {log, g} = setup();
		g.down(at(1, 100, 100));
		g.move(at(1, 100, 60));
		g.move(at(1, 100, 95));
		g.up(at(1, 100, 95));
		expect(log).toStrictEqual(["press", "drag", "drag"]);
	});

	it("gives two moving fingers to the camera for good, with no swipe after", () => {
		const {log, g} = setup();
		g.down(at(1, 100, 100));
		vi.advanceTimersByTime(200);
		g.down(at(2, 200, 100));
		g.move(at(1, 80, 100));
		g.move(at(2, 220, 100));
		g.move(at(2, 240, 100));
		g.up(at(1, 80, 100));
		g.move(at(2, 300, 100));
		g.up(at(2, 300, 100));
		expect(log).toStrictEqual(["press", "drag", "cameraStart", {ratio: 160 / 140, dx: 10, dy: 0, x: 160, y: 100}]);
	});

	it("takes fingers landing together as the camera, even with one held still", () => {
		const {log, g} = setup();
		g.down(at(1, 100, 100));
		g.down(at(2, 200, 100));
		g.move(at(2, 300, 100));
		expect(log).toStrictEqual(["press", "cameraStart", {ratio: 2, dx: 50, dy: 0, x: 200, y: 100}]);
	});

	it("reads a spacing that barely changes as a pan, not a zoom", () => {
		const {log, g} = setup();
		g.down(at(1, 100, 100));
		g.down(at(2, 200, 100));
		g.move(at(1, 104, 100));
		expect(log).toStrictEqual(["press", "cameraStart", {ratio: 1, dx: 2, dy: 0, x: 152, y: 100}]);
	});

	it("reads a whole frame of finger moves as one step of the camera", () => {
		const log: CameraMove[] = [];
		const frames: (() => void)[] = [];
		const g = fingerGestures(
			{camera: (move) => log.push(move)},
			{
				frame: (run) => {
					frames.push(run);
				},
			},
		);
		g.down(at(1, 100, 100));
		g.down(at(2, 200, 100));
		g.move(at(1, 60, 100));
		g.move(at(2, 160, 100));
		expect(frames.length).toBe(1);
		frames[0]!();
		expect(log).toStrictEqual([{ratio: 1, dx: -40, dy: 0, x: 110, y: 100}]);
	});

	it("lets a finger off the surface make a pair but never act alone", () => {
		const {log, g} = setup();
		g.down(at(1, 100, 100), true);
		g.move(at(1, 100, 40));
		g.up(at(1, 100, 40));
		vi.advanceTimersByTime(200);
		g.down(at(2, 100, 100), true);
		vi.advanceTimersByTime(200);
		g.down(at(3, 300, 300));
		g.move(at(3, 300, 250));
		expect(log).toStrictEqual(["press", "drag"]);
	});

	it("pairs a finger off the surface that lands together with one on it", () => {
		const {log, g} = setup();
		g.down(at(1, 100, 100));
		g.down(at(2, 100, 400), true);
		expect(log).toStrictEqual(["press", "cameraStart"]);
	});

	it("forgets a cancelled finger", () => {
		const {log, g} = setup();
		g.down(at(1, 100, 100));
		g.move(at(1, 100, 60));
		g.cancel(at(1, 100, 60));
		g.down(at(2, 100, 100));
		g.up(at(2, 100, 100));
		expect(log).toStrictEqual(["press", "drag", "press"]);
	});

	it("reads two quick taps as a double tap", () => {
		const {log, g} = setup();
		g.down(at(1, 100, 100));
		g.up(at(1, 100, 100));
		g.down(at(2, 104, 100));
		g.up(at(2, 104, 100));
		expect(log).toStrictEqual(["press", "press", "doubleTap"]);
	});

	it("with eagerCamera takes the camera as the second finger lands", () => {
		const {log, g} = setup(true);
		vi.advanceTimersByTime(600);
		g.down(at(1, 100, 100));
		vi.advanceTimersByTime(600);
		g.down(at(2, 200, 100));
		expect(log).toStrictEqual(["press", "cameraStart"]);
	});
});
