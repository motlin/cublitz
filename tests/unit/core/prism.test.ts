import {describe, expect, it} from "vite-plus/test";
import {blank} from "../../../src/core/cube.ts";
import {landingTiles} from "../../../src/core/prism.ts";
import type {State, Unit} from "../../../src/core/types.ts";

const block = (cubes: [number, number, number][]): State =>
{
	const units: Unit[] = cubes.map(([x, y, z]) => (
	{
		x,
		y,
		z,
		f: blank(),
	}));
	return {
		x: units[0]!.x,
		y: units[0]!.y,
		f: blank(),
		boxes: [],
		sw: [],
		units,
		loose: [],
	};
};

describe("landingTiles", () =>
{
	it("marks the cell next to a single cube", () =>
	{
		const single: State =
		{
			x: 3,
			y: 3,
			f: blank(),
			boxes: [],
			sw: [],
		};
		expect([landingTiles(single, "E"), landingTiles(single, "N")]).toStrictEqual([[[4, 3]], [[3, 2]]]);
	});

	it("lays a standing tower down along the swipe", () =>
	{
		expect([
			landingTiles(
				block([
					[1, 1, 0],
					[1, 1, 1],
				]),
				"E",
			),
			landingTiles(
				block([
					[1, 1, 0],
					[1, 1, 1],
					[1, 1, 2],
				]),
				"W",
			),
			landingTiles(
				block([
					[1, 1, 0],
					[1, 1, 1],
				]),
				"S",
			),
		]).toStrictEqual([
			[
				[2, 1],
				[3, 1],
			],
			[
				[-2, 1],
				[-1, 1],
				[0, 1],
			],
			[
				[1, 2],
				[1, 3],
			],
		]);
	});

	it("stands a block lying along the swipe up on one cell, and slides one lying across it", () =>
	{
		expect([
			landingTiles(
				block([
					[1, 1, 0],
					[2, 1, 0],
				]),
				"E",
			),
			landingTiles(
				block([
					[1, 1, 0],
					[1, 2, 0],
				]),
				"E",
			),
		]).toStrictEqual([
			[[3, 1]],
			[
				[2, 1],
				[2, 2],
			],
		]);
	});
});
