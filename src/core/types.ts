// The game's data as the types describe it. Only campaign levels and the generator are held to these
// types at runtime: a level from a share code passes decodeLevel with nothing but its map checked, and
// the rules deliberately treat whatever else it contains exactly as the original script did.

export type Face = "t" | "b" | "n" | "s" | "e" | "w";
export type Direction = "N" | "S" | "E" | "W";
export type Paint = "r" | "o" | "y" | "g" | "c" | "b" | "p";
/** A color pieces can have. White ('w') pieces answer to a completely bare cube. */
export type PieceColor = Paint | "w";
/** What a face carries: a paint, or '' while bare. */
export type FaceColor = Paint | "";
export type Faces = Record<Face, FaceColor>;

export type FloorCell = {t: "floor"};
export type GoalCell = {t: "goal"};
export type WashCell = {t: "wash"};
export type WhiteGateCell = {t: "wgate"; f: Face};
export type PaintCell = {t: "paint"; c: Paint};
export type GateCell = {t: "gate"; c: Paint};
export type SwitchCell = {t: "switch"; c: PieceColor; i: number};
export type ButtonCell = {t: "button"; c: PieceColor};
export type DoorCell = {t: "door"; c: PieceColor};
export type Cell = FloorCell | GoalCell | WashCell | WhiteGateCell | PaintCell | GateCell | SwitchCell | ButtonCell | DoorCell;

/** A level's legend entry for a map character. */
export type LegendEntry = ["wgate", Face] | ["box" | "switch" | "button" | "door", PieceColor];
export type Legend = Record<string, LegendEntry>;
export type Need = Partial<Record<Face, Paint>>;

export type LevelSource = {
	map: string[];
	name?: string;
	tip?: string;
	par?: number;
	k?: Legend;
	need?: Need | undefined;
	inf?: number;
};

export type Box = {x: number; y: number; c: PieceColor};
export type BoardSwitch = {x: number; y: number; c: PieceColor};

/** A level after parseLevel. sx and sy stay unset at runtime on a share code whose map has no 'S'. */
export type Level = LevelSource & {
	cells: (Cell | null)[][];
	boxes0: Box[];
	switches: BoardSwitch[];
	cols: number;
	rows: number;
	sx: number;
	sy: number;
};

export type State = {x: number; y: number; f: Faces; boxes: Box[]; sw: number[]};
export type OpenColors = Partial<Record<PieceColor, true>>;

type Blocked = {ok: false; nx: number; ny: number};
export type MoveFailure =
	| (Blocked & {why: "edge"})
	| (Blocked & {why: "gate"; c: Paint; down: FaceColor})
	| (Blocked & {why: "wgate"; f: Face; has: FaceColor})
	| (Blocked & {why: "box"; c: PieceColor})
	| (Blocked & {why: "stuck"; c: PieceColor})
	| (Blocked & {why: "door"; c: PieceColor});
export type MoveSuccess = {
	ok: true;
	nx: number;
	ny: number;
	st: State;
	painted: Paint | null;
	washed: boolean;
	pushed: number;
	flipped: number;
	goal: boolean;
	won: boolean;
	cell: Cell;
};
export type MoveResult = MoveFailure | MoveSuccess;
