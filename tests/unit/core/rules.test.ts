import {describe, expect, it} from "vitest";
import {blank} from "../../../src/core/cube.ts";
import {initState, parseLevel} from "../../../src/core/level.ts";
import {doorOpen, openColors, pressed, stateKey, tryMove} from "../../../src/core/rules.ts";
import type {Box, Cell, Faces, LevelSource, MoveSuccess, Paint, State} from "../../../src/core/types.ts";

const solid = (c: Paint): Faces => ({t: c, b: c, n: c, s: c, e: c, w: c});
const at = (source: LevelSource, overrides: Partial<State> = {}) => {
	const level = parseLevel(source);
	return {level, state: {...initState(level), ...overrides}};
};

describe("tryMove refusals", () => {
	it("edge: off the board", () => {
		const {level, state} = at({map: ["S.X"]});
		expect(tryMove(level, state, "W")).toStrictEqual({ok: false, why: "edge", nx: -1, ny: 0});
	});

	it("edge: into a hole", () => {
		const {level, state} = at({map: ["S X"]});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "edge", nx: 1, ny: 0});
	});

	it("edge: on a map with no start", () => {
		const {level, state} = at({map: [".X"]});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "edge", nx: Number.NaN, ny: Number.NaN});
	});

	it("gate: the face turning down is the wrong color", () => {
		const {level, state} = at({map: ["SR"]}, {f: {...blank(), e: "b"}});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "gate", c: "r", down: "b", nx: 1, ny: 0});
	});

	it("gate: the face turning down is bare", () => {
		const {level, state} = at({map: ["SR"]});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "gate", c: "r", down: "", nx: 1, ny: 0});
	});

	it("wgate: the named face would be painted on landing", () => {
		const {level, state} = at({map: ["SW"]}, {f: {...blank(), e: "g"}});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "wgate", f: "b", has: "g", nx: 1, ny: 0});
	});

	it("box: the cube cannot work that color", () => {
		const {level, state} = at({map: ["S1."], k: {"1": ["box", "r"]}});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "box", c: "r", nx: 1, ny: 0});
	});

	const pushInto = (behind: string, legend: LevelSource["k"] = {}) =>
		at({map: [`S1${behind}`], k: {"1": ["box", "w"], ...legend}});

	it("stuck: nothing behind the box", () => {
		const {level, state} = pushInto("");
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "stuck", c: "w", nx: 1, ny: 0});
	});

	it.each([
		["gate", "R"],
		["white gate", "W"],
		["target", "X"],
	])("stuck: a box cannot slide onto a %s", (_name, behind) => {
		const {level, state} = pushInto(behind);
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "stuck", c: "w", nx: 1, ny: 0});
	});

	it("stuck: another box is behind it", () => {
		const {level, state} = pushInto("2", {"2": ["box", "r"]});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "stuck", c: "w", nx: 1, ny: 0});
	});

	it("door: a shut door refuses the cube", () => {
		const {level, state} = at({map: ["S1"], k: {"1": ["door", "r"]}});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "door", c: "r", nx: 1, ny: 0});
	});

	it("door: a shut door refuses a pushed box, reporting the door's position", () => {
		const {level, state} = pushInto("2", {"2": ["door", "r"]});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "door", c: "r", nx: 2, ny: 0});
	});

	it("door: stepping off a button lets its door shut in your face", () => {
		const {level, state} = at({map: ["12"], k: {"1": ["button", "w"], "2": ["door", "w"]}}, {x: 0, y: 0});
		expect(tryMove(level, state, "E")).toStrictEqual({ok: false, why: "door", c: "w", nx: 1, ny: 0});
	});
});

describe("tryMove successes", () => {
	const success = (overrides: Partial<MoveSuccess>): MoveSuccess => ({
		ok: true,
		nx: 1,
		ny: 0,
		st: {x: 1, y: 0, f: blank(), boxes: [], sw: []},
		painted: null,
		washed: false,
		pushed: -1,
		flipped: -1,
		goal: false,
		won: false,
		cell: {t: "floor"},
		...overrides,
	});
	const landedAt = (f: Faces, rest: Partial<State> = {}): State => ({x: 1, y: 0, f, boxes: [], sw: [], ...rest});

	it("rolls onto floor, turning the faces", () => {
		const {level, state} = at({map: ["S."]}, {f: {...blank(), t: "r"}});
		expect(tryMove(level, state, "E")).toStrictEqual(success({st: landedAt({...blank(), e: "r"})}));
	});

	it("paints the face that lands on a puddle, even over paint", () => {
		const {level, state} = at({map: ["Sb"]}, {f: {...blank(), e: "r"}});
		expect(tryMove(level, state, "E")).toStrictEqual(
			success({painted: "b", st: landedAt({...blank(), b: "b"}), cell: {t: "paint", c: "b"}}),
		);
	});

	it("passes a gate with the matching face down and keeps the paint", () => {
		const {level, state} = at({map: ["SR"]}, {f: {...blank(), e: "r"}});
		expect(tryMove(level, state, "E")).toStrictEqual(success({st: landedAt({...blank(), b: "r"}), cell: {t: "gate", c: "r"}}));
	});

	it("passes a named white gate while the named face stays bare", () => {
		const {level, state} = at({map: ["S1"], k: {"1": ["wgate", "t"]}}, {f: {...blank(), e: "r"}});
		expect(tryMove(level, state, "E")).toStrictEqual(success({st: landedAt({...blank(), b: "r"}), cell: {t: "wgate", f: "t"}}));
	});

	it("wash strips every face and reports it", () => {
		const {level, state} = at({map: ["SZ"]}, {f: {...blank(), t: "r"}});
		expect(tryMove(level, state, "E")).toStrictEqual(success({washed: true, cell: {t: "wash"}}));
	});

	it("wash on a bare cube reports nothing washed", () => {
		const {level, state} = at({map: ["SZ"]});
		expect(tryMove(level, state, "E")).toStrictEqual(success({cell: {t: "wash"}}));
	});

	const redSwitch: LevelSource = {map: ["S1"], k: {"1": ["switch", "r"]}};
	const redSwitchCell: Cell = {t: "switch", c: "r", i: 0};

	it("a solid cube flips a switch of its color, leaving the old state alone", () => {
		const {level, state} = at(redSwitch, {f: solid("r")});
		expect(tryMove(level, state, "E")).toStrictEqual(
			success({flipped: 0, st: landedAt(solid("r"), {sw: [1]}), cell: redSwitchCell}),
		);
		expect(state.sw).toStrictEqual([0]);
	});

	it("flips a switch back off", () => {
		const {level, state} = at(redSwitch, {f: solid("r"), sw: [1]});
		expect(tryMove(level, state, "E")).toStrictEqual(
			success({flipped: 0, st: landedAt(solid("r"), {sw: [0]}), cell: redSwitchCell}),
		);
	});

	it("rolling over a switch of another color does nothing", () => {
		const {level, state} = at(redSwitch);
		expect(tryMove(level, state, "E")).toStrictEqual(success({st: landedAt(blank(), {sw: [0]}), cell: redSwitchCell}));
	});

	it("a bare cube flips a white switch", () => {
		const {level, state} = at({map: ["S1"], k: {"1": ["switch", "w"]}});
		expect(tryMove(level, state, "E")).toStrictEqual(
			success({flipped: 0, st: landedAt(blank(), {sw: [1]}), cell: {t: "switch", c: "w", i: 0}}),
		);
	});

	it("pushes a box of the cube's working color", () => {
		const {level, state} = at({map: ["S1."], k: {"1": ["box", "w"]}});
		expect(tryMove(level, state, "E")).toStrictEqual(success({pushed: 0, st: landedAt(blank(), {boxes: [{x: 2, y: 0, c: "w"}]})}));
		expect(state.boxes).toStrictEqual([{x: 1, y: 0, c: "w"}]);
	});

	it("pushes a box into a door held open by a switch, leaving other boxes alone", () => {
		const {level, state} = at(
			{map: ["S1234"], k: {"1": ["box", "w"], "2": ["door", "r"], "3": ["switch", "r"], "4": ["box", "r"]}},
			{sw: [1]},
		);
		const boxes: Box[] = [
			{x: 2, y: 0, c: "w"},
			{x: 4, y: 0, c: "r"},
		];
		expect(tryMove(level, state, "E")).toStrictEqual(success({pushed: 0, st: landedAt(blank(), {boxes, sw: [1]})}));
	});

	it("enters a door held open by a flipped switch", () => {
		const {level, state} = at({map: ["S12"], k: {"1": ["door", "r"], "2": ["switch", "r"]}}, {sw: [1]});
		expect(tryMove(level, state, "E")).toStrictEqual(success({st: landedAt(blank(), {sw: [1]}), cell: {t: "door", c: "r"}}));
	});

	it("reaches a target with no needs and wins", () => {
		const {level, state} = at({map: ["SX"]});
		expect(tryMove(level, state, "E")).toStrictEqual(success({goal: true, won: true, cell: {t: "goal"}}));
	});

	it("reaches a target missing its needs without winning", () => {
		const {level, state} = at({map: ["SX"], need: {t: "r"}});
		expect(tryMove(level, state, "E")).toStrictEqual(success({goal: true, cell: {t: "goal"}}));
	});

	it("reaches a target meeting every need and wins", () => {
		const {level, state} = at({map: ["SX"], need: {e: "r", b: "b"}}, {f: {...blank(), t: "r", e: "b"}});
		expect(tryMove(level, state, "E")).toStrictEqual(
			success({goal: true, won: true, st: landedAt({...blank(), e: "r", b: "b"}), cell: {t: "goal"}}),
		);
	});

	it("needs every need, not just one", () => {
		const {level, state} = at({map: ["SX"], need: {e: "r", b: "b"}}, {f: {...blank(), t: "r"}});
		expect(tryMove(level, state, "E")).toStrictEqual(success({goal: true, st: landedAt({...blank(), e: "r"}), cell: {t: "goal"}}));
	});
});

describe("openColors", () => {
	const legend: LevelSource["k"] = {"1": ["switch", "r"], "2": ["button", "w"], "3": ["box", "b"], "4": ["button", "b"]};

	it("is empty with everything off", () => {
		const {level, state} = at({map: ["S.1"], k: legend});
		expect(openColors(level, {...state, f: {...blank(), t: "r"}})).toStrictEqual({});
	});

	it("opens a flipped switch's color", () => {
		const {level, state} = at({map: ["S.1"], k: legend}, {sw: [1]});
		expect(openColors(level, state)).toStrictEqual({r: true});
	});

	it("opens a button held by a cube of its working color", () => {
		const {level, state} = at({map: ["2S"], k: legend}, {x: 0});
		expect(openColors(level, state)).toStrictEqual({w: true});
	});

	it("keeps a button shut under a cube of another color", () => {
		const {level, state} = at({map: ["2S"], k: legend}, {x: 0, f: solid("r")});
		expect(openColors(level, state)).toStrictEqual({});
	});

	it("opens a button holding a box of its color", () => {
		const {level, state} = at({map: ["S34"], k: legend}, {boxes: [{x: 2, y: 0, c: "b"}]});
		expect(openColors(level, state)).toStrictEqual({b: true});
	});

	it("keeps a button shut under a box of another color", () => {
		const {level, state} = at({map: ["S34"], k: legend}, {boxes: [{x: 2, y: 0, c: "r"}]});
		expect(openColors(level, state)).toStrictEqual({});
	});
});

describe("pressed and doorOpen", () => {
	it("pressed works out the cube's color when none is passed, and uses one that is", () => {
		const {level, state} = at({map: ["1S"], k: {"1": ["button", "w"]}}, {x: 0});
		expect([pressed(level, state, 0, 0), pressed(level, state, 0, 0, "r"), pressed(level, state, 0, 0, "w")]).toStrictEqual([
			true,
			false,
			true,
		]);
	});

	it("a door shows open for its color, under the cube, or under a box", () => {
		const {level, state} = at({map: ["1S2", "3"], k: {"1": ["door", "r"], "2": ["box", "r"], "3": ["door", "b"]}}, {
			boxes: [{x: 0, y: 1, c: "r"}],
		});
		expect([
			doorOpen(level, state, 0, 0, {}),
			doorOpen(level, state, 0, 0, {r: true}),
			doorOpen(level, {...state, x: 0}, 0, 0, {}),
			doorOpen(level, state, 0, 1, {}),
		]).toStrictEqual([false, true, true, true]);
	});
});

describe("stateKey", () => {
	it("encodes position, faces in FACES order, boxes and switches", () => {
		const state: State = {
			x: 3,
			y: 4,
			f: {t: "r", b: "", n: "b", s: "", e: "", w: "g"},
			boxes: [
				{x: 1, y: 2, c: "r"},
				{x: 5, y: 6, c: "w"},
			],
			sw: [1, 0],
		};
		expect(stateKey(state)).toBe("3,4,r-b--g,1:2;5:6,10");
	});
});
