import {describe, expect, it} from "vite-plus/test";
import {fitBoard, gridAxes, swipeAxis} from "../../../src/ui/touch-geometry.ts";

const degrees = Object.fromEntries(Object.entries(gridAxes()).map(([d, a]) => [d, Math.round(a)]));

describe("the on-screen grid axes", () => {
	it("come from the board's transform", () => {
		expect(degrees).toStrictEqual({E: 11, S: 118, W: -169, N: -62});
	});
});

const swipeAt = (angle: number) => {
	const rad = (angle * Math.PI) / 180;
	return swipeAxis(Math.cos(rad) * 50, Math.sin(rad) * 50);
};

describe("swipeAxis", () => {
	it("takes the nearest drawn axis, not the nearest screen axis", () => {
		expect([0, 45, 90, 135, 180, -135, -90, -45].map(swipeAt)).toStrictEqual([
			"E",
			"E",
			"S",
			"S",
			"W",
			"W",
			"N",
			"N",
		]);
	});
});

describe("fitBoard", () => {
	it("keeps every corner of a tall cube inside the area", () => {
		for (const [cols, rows, width, height] of [
			[17, 4, 320, 300],
			[1, 1, 320, 300],
			[18, 12, 300, 160],
			[6, 1, 568, 200],
		] as const) {
			const fit = fitBoard(cols, rows, width, height);
			expect(fit.width <= width && fit.height <= height).toBe(true);
			expect(fit.cell >= 1 && fit.cell <= 62).toBe(true);
			// One size up would no longer fit, unless the cell is already at its largest.
			const next = fitBoard(cols, rows, width + 400, height + 400);
			expect(next.cell >= fit.cell).toBe(true);
		}
	});

	it("does not fit an area that has no size yet", () => {
		expect(fitBoard(5, 5, 0, 0).cell).toBe(24);
	});
});
