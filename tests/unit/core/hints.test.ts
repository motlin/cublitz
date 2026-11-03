import {describe, expect, it} from "vite-plus/test";
import {blank} from "../../../src/core/cube.ts";
import {hintTexts, milestoneReached, nextMilestone, preFace} from "../../../src/core/hints.ts";
import type {Milestone} from "../../../src/core/hints.ts";
import {initState, parseLevel} from "../../../src/core/level.ts";
import {MERGE_LEVELS} from "../../../src/core/merge-levels.ts";
import {tryMove} from "../../../src/core/rules.ts";
import type {Direction, Faces, Level, LevelSource, MoveSuccess, Paint, State} from "../../../src/core/types.ts";

const solid = (c: Paint): Faces => ({t: c, b: c, n: c, s: c, e: c, w: c});
const setup = (source: LevelSource, overrides: Partial<State> = {}) => {
	const level = parseLevel(source);
	return {level, state: {...initState(level), ...overrides}};
};
const milestoneOf = (source: LevelSource, path: string, overrides: Partial<State> = {}) => {
	const {level, state} = setup(source, overrides);
	return {level, state, m: nextMilestone(level, state, path)!};
};

describe("preFace", () => {
	it("traces which face ends up where after each roll", () => {
		expect([
			preFace("E", "b"),
			preFace("W", "b"),
			preFace("N", "b"),
			preFace("S", "b"),
			preFace("E", "n"),
		]).toStrictEqual(["e", "w", "n", "s", "n"]);
	});
});

const base = (state: State, overrides: Partial<Milestone> = {}) => ({
	i: 0,
	d: "E",
	x: 1,
	y: 0,
	path: "E",
	prev: state,
	paints: [],
	...overrides,
});

describe("nextMilestone", () => {
	it("goal: the winning roll", () => {
		const {m, state} = milestoneOf({map: ["SX"]}, "E");
		expect(m).toStrictEqual({...base(state), type: "goal"});
	});

	it("is null when nothing on the path stands out", () => {
		const {level, state} = setup({map: ["S.."]});
		expect(nextMilestone(level, state, "EE")).toBe(null);
	});

	it("gate: rolling onto a gate, listing paints picked up before that step", () => {
		const {m} = milestoneOf({map: [".rR"]}, "EE", {x: 0, y: 0, f: {...blank(), t: "r"}});
		expect(m).toStrictEqual({
			i: 1,
			d: "E",
			x: 2,
			y: 0,
			path: "EE",
			prev: {x: 1, y: 0, f: {...blank(), e: "r", b: "r"}, boxes: [], sw: []},
			paints: ["r"],
			type: "gate",
			c: "r",
		});
	});

	it("skips a gate for a cube that is already solid", () => {
		const {level, state} = setup({map: ["SR"]}, {f: solid("r")});
		expect(nextMilestone(level, state, "E")).toBe(null);
	});

	it("wgate: rolling onto a white gate, even when solid", () => {
		const {m, state} = milestoneOf({map: ["S1"], k: {"1": ["wgate", "t"]}}, "E");
		expect(m).toStrictEqual({...base(state), type: "wgate", f: "t"});
	});

	it("wash: only when it removed paint", () => {
		const washed = milestoneOf({map: ["SZ"]}, "E", {f: {...blank(), t: "r"}});
		expect(washed.m).toStrictEqual({...base(washed.state), type: "wash"});
		const {level, state} = setup({map: ["SZ"]});
		expect(nextMilestone(level, state, "E")).toBe(null);
	});

	it("switch: only when it flipped", () => {
		const legend: LevelSource = {map: ["S1"], k: {"1": ["switch", "w"]}};
		const flipped = milestoneOf(legend, "E");
		expect(flipped.m).toStrictEqual({...base(flipped.state), type: "switch", c: "w"});
		const {level, state} = setup(legend, {f: {...blank(), t: "r"}});
		expect(nextMilestone(level, state, "E")).toBe(null);
	});

	it("solid: the roll that finishes a coat", () => {
		const {m, state} = milestoneOf({map: ["Sr"]}, "E", {f: {...solid("r"), e: ""}});
		expect(m).toStrictEqual({...base(state), type: "solid", c: "r"});
	});

	it("button: a box arriving on its own button, from its first push", () => {
		const {m, state} = milestoneOf({map: ["S1.2"], k: {"1": ["box", "w"], "2": ["button", "w"]}}, "EE");
		expect(m).toStrictEqual({
			...base(state),
			i: 1,
			x: 3,
			y: 0,
			path: "EE",
			prev: {...state, x: 1, boxes: [{x: 2, y: 0, c: "w"}]},
			type: "button",
			c: "w",
			box: 0,
			firstPush: {d: "E", box: 0},
			from: {x: 1, y: 0, c: "w"},
		});
	});

	it("skips a push onto a button of another color", () => {
		const {level, state} = setup({
			map: ["S12"],
			k: {"1": ["box", "w"], "2": ["button", "r"]},
		});
		expect(nextMilestone(level, state, "E")).toBe(null);
	});

	const doorLevel: LevelSource = {map: ["S.12"], k: {"1": ["door", "r"], "2": ["switch", "r"]}};

	it("door: the first step, even though the door was already open", () => {
		const {m, state} = milestoneOf({map: ["S12"], k: {"1": ["door", "r"], "2": ["switch", "r"]}}, "E", {sw: [1]});
		expect(m).toStrictEqual({...base(state), type: "door", c: "r"});
	});

	it("skips a door that was already open once past the first step", () => {
		const {level, state} = setup(doorLevel, {sw: [1]});
		expect(nextMilestone(level, state, "EE")).toBe(null);
	});
});

const textFor = (source: LevelSource, path: string, overrides: Partial<State> = {}) => {
	const {level, state, m} = milestoneOf(source, path, overrides);
	return hintTexts(level, state, m);
};

describe("hintTexts", () => {
	it("goal with no needs", () => {
		expect(textFor({map: ["SX"]}, "E")).toStrictEqual([
			"Head for the target.",
			"Arrive rolling east. Nothing else is required.",
		]);
	});

	it("goal with needs the cube already has paint for", () => {
		expect(
			textFor({map: ["SX"], need: {e: "r", b: "b"}}, "E", {
				f: {...blank(), t: "r", e: "b"},
			}),
		).toStrictEqual([
			"Head for the target. It wants red on east and blue on bottom.",
			"Arrive rolling east. Just before that last roll, have red on your top face and blue on your east face.",
		]);
	});

	it("goal with needs the cube has no paint for, each color named once", () => {
		const level = parseLevel({map: ["SX"], need: {t: "r", n: "r", s: "b"}});
		const state = initState(level);
		const m: Milestone = {
			i: 0,
			d: "E",
			x: 1,
			y: 0,
			path: "E",
			prev: state,
			paints: [],
			type: "goal",
		};
		expect(hintTexts(level, state, m)).toStrictEqual([
			"Head for the target. It wants red on top, red on north and blue on south. You'll need red and blue paint for that.",
			"Arrive rolling east. Just before that last roll, have red on your west face, red on your north face and blue on your south face.",
		]);
	});

	it("wash", () => {
		expect(textFor({map: ["SZ"]}, "E", {f: {...blank(), t: "r"}})).toStrictEqual([
			"Next, roll onto the highlighted paint remover.",
			"It wipes all six faces back to bare at once. Use up any paint you still need first, like a gate's color or a switch's solid coat.",
		]);
	});

	it("white gate with several bare faces", () => {
		expect(textFor({map: ["S1"], k: {"1": ["wgate", "t"]}}, "E")).toStrictEqual([
			"Your next goal is the highlighted top white gate. You have 6 bare faces left.",
			"Roll onto it heading east. That roll moves your west face to the top, so keep your west face bare until then. Plan which faces the puddles on the way are allowed to paint.",
		]);
	});

	it("white gate with one bare face", () => {
		expect(textFor({map: ["SW"]}, "E", {f: {...solid("r"), e: ""}})[0]).toBe(
			"Your next goal is the highlighted white gate. You have 1 bare face left.",
		);
	});

	it("gate when the cube has the paint", () => {
		expect(textFor({map: ["SR"]}, "E", {f: {...blank(), e: "r"}})).toStrictEqual([
			"Your next goal is the highlighted red gate.",
			"Roll onto it heading east. That roll turns your east face down, so that face needs to be red first.",
		]);
	});

	it("gate when the cube still needs the paint", () => {
		const level = parseLevel({map: ["SR"]});
		const state = initState(level);
		const m: Milestone = {
			i: 0,
			d: "E",
			x: 1,
			y: 0,
			path: "E",
			prev: state,
			paints: [],
			type: "gate",
			c: "r",
		};
		expect(hintTexts(level, state, m)[0]).toBe(
			"Your next goal is the highlighted red gate. You'll need red paint first.",
		);
	});

	it("solid", () => {
		expect(textFor({map: ["Sr"]}, "E", {f: {...solid("r"), e: ""}})).toStrictEqual([
			"Next, coat all six faces red on the highlighted puddles.",
			"Rolling straight back and forth only reaches four faces. Turn a corner while you're on the red puddles to reach the other two. The face map shows which ones are still bare.",
		]);
	});

	it("switch when the cube is already the right color", () => {
		expect(textFor({map: ["S1"], k: {"1": ["switch", "w"]}}, "E")).toStrictEqual([
			"Next, flip the highlighted white switch.",
			"You're completely bare already. Roll onto it from any side.",
		]);
	});

	it("switch when the cube is not the right color yet", () => {
		const level = parseLevel({map: ["S1"], k: {"1": ["switch", "r"]}});
		const state = initState(level);
		const m: Milestone = {
			i: 0,
			d: "E",
			x: 1,
			y: 0,
			path: "E",
			prev: state,
			paints: [],
			type: "switch",
			c: "r",
		};
		expect(hintTexts(level, state, m)).toStrictEqual([
			"Next, flip the highlighted red switch.",
			"It only flips for a cube that is solid red when it lands.",
		]);
	});

	it("button", () => {
		expect(textFor({map: ["S12"], k: {"1": ["box", "w"], "2": ["button", "w"]}}, "E")).toStrictEqual([
			"Next, get the white box onto the highlighted white button.",
			"Start by pushing the box east. To push, roll into it from its west side while completely bare.",
		]);
	});

	it("door", () => {
		const level = parseLevel({map: ["S1"], k: {"1": ["door", "r"]}});
		const state = initState(level);
		const m: Milestone = {
			i: 0,
			d: "E",
			x: 1,
			y: 0,
			path: "E",
			prev: state,
			paints: [],
			type: "door",
			c: "r",
		};
		expect(hintTexts(level, state, m)).toStrictEqual([
			"Next, get through the highlighted red door.",
			"It has to be open as you finish the roll onto it. A flipped red switch, or a red box sitting on a red button, keeps it open.",
		]);
	});
});

const roll = (level: Level, state: State, d: string) => tryMove(level, state, d as Direction) as MoveSuccess;
const walk = (level: Level, state: State, path: string) =>
	path.split("").reduce((st, d) => roll(level, st, d).st, state);
const block = (a: Faces, b: Faces): State => ({
	x: 0,
	y: 0,
	f: a,
	boxes: [],
	sw: [],
	units: [
		{x: 0, y: 0, z: 0, f: a},
		{x: 1, y: 0, z: 0, f: b},
	],
	loose: [],
});
const sideBySide = () => {
	const level = MERGE_LEVELS.find((l) => l.name === "Side by Side")!;
	return {level, state: initState(level)};
};

describe("milestoneReached for a block", () => {
	it("counts a gate passed by a foot other than the first cube", () => {
		const {level, state} = sideBySide();
		const before = walk(level, state, "EEESSSS");
		const m = nextMilestone(level, before, "SS")!;
		const r = roll(level, before, "S");
		expect([m.type, m.x, m.y, r.st.x, r.st.y, milestoneReached(m, r)]).toStrictEqual(["gate", 3, 5, 4, 5, true]);
	});

	it("does not count a gate the block has not reached yet", () => {
		const {level, state} = sideBySide();
		const before = walk(level, state, "EEESSS");
		const m = nextMilestone(level, before, "SSS")!;
		expect([m.type, milestoneReached(m, roll(level, before, "S"))]).toStrictEqual(["gate", false]);
	});

	it("counts a coat only once it covers every cube of the block", () => {
		const {level, state} = sideBySide();
		const r = roll(level, state, "E");
		const m = {...base(r.st), type: "solid", c: "r"} as Milestone;
		const reached = (st: State) => milestoneReached(m, {...r, st});
		expect([reached(block(solid("r"), solid("r"))), reached(block(solid("r"), blank()))]).toStrictEqual([
			true,
			false,
		]);
	});
});

describe("hintTexts for a block", () => {
	const level = parseLevel({map: ["S.R"]});

	it("gate: paint on the second cube counts", () => {
		const st = block(blank(), {...blank(), t: "r"});
		const [what] = hintTexts(level, st, {...base(st), type: "gate", c: "r"} as Milestone);
		expect(what).toBe("Your next goal is the highlighted red gate.");
	});

	it("white gate: counts the bare faces of every cube", () => {
		const st = block(solid("r"), {...blank(), t: "r"});
		const [what] = hintTexts(level, st, {...base(st), type: "wgate", f: "t"} as Milestone);
		expect(what).toBe("Your next goal is the highlighted top white gate. You have 5 bare faces left.");
	});

	it("switch: reads the whole block's working color", () => {
		const st = block(solid("r"), blank());
		const [, how] = hintTexts(level, st, {...base(st), type: "switch", c: "r"} as Milestone);
		expect(how).toBe("It only flips for a cube that is solid red when it lands.");
	});
});
