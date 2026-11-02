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

export type FloorCell =
{
	t: "floor";
};
export type GoalCell =
{
	t: "goal";
};
export type WashCell =
{
	t: "wash";
};
export type WhiteGateCell =
{
	t: "wgate";
	f: Face;
};
export type PaintCell =
{
	t: "paint";
	c: Paint;
};
export type GateCell =
{
	t: "gate";
	c: Paint;
};
export type SwitchCell =
{
	t: "switch";
	c: PieceColor;
	i: number;
};
export type ButtonCell =
{
	t: "button";
	c: PieceColor;
};
export type DoorCell =
{
	t: "door";
	c: PieceColor;
};
export type Cell =
	| FloorCell
	| GoalCell
	| WashCell
	| WhiteGateCell
	| PaintCell
	| GateCell
	| SwitchCell
	| ButtonCell
	| DoorCell;

/** A level's legend entry for a map character. */
export type LegendEntry = ["wgate", Face] | ["box" | "switch" | "button" | "door", PieceColor] | ["cube", "w"];
export type Legend = Record<string, LegendEntry>;
export type Need = Partial<Record<Face, Paint>>;

export type LevelSource =
{
	map: string[];
	name?: string;
	tip?: string;
	par?: number | null;
	k?: Legend;
	need?: Need | undefined;
	inf?: number;
};

export type Box =
{
	x: number;
	y: number;
	c: PieceColor;
};
export type BoardSwitch =
{
	x: number;
	y: number;
	c: PieceColor;
};

/** A level after parseLevel. sx and sy stay unset at runtime on a share code whose map has no 'S'. */
export type Level = LevelSource &
{
	cells: (Cell | null)[][];
	boxes0: Box[];
	/** Loose cubes the player can merge with. Only a level whose legend has a cube gets this. */
	cubes0?:
	{
		x: number;
		y: number;
	}[];
	switches: BoardSwitch[];
	cols: number;
	rows: number;
	sx: number;
	sy: number;
};

/** One cube of a merged block, with z counted up from the floor. */
export type Unit =
{
	x: number;
	y: number;
	z: number;
	f: Faces;
};
export type LooseCube =
{
	x: number;
	y: number;
	f: Faces;
};
/**
 * units and loose appear only on a level with loose cubes, and then x, y and f mirror the first unit.
 */
export type State =
{
	x: number;
	y: number;
	f: Faces;
	boxes: Box[];
	sw: number[];
	units?: Unit[];
	loose?: LooseCube[];
};
export type OpenColors = Partial<Record<PieceColor, true>>;

type Blocked =
{
	ok: false;
	nx: number;
	ny: number;
};
export type MoveFailure =
	| (Blocked &
	  {
			why: "edge";
	  })
	| (Blocked &
	  {
			why: "gate";
			c: Paint;
			down: FaceColor;
	  })
	| (Blocked &
	  {
			why: "wgate";
			f: Face;
			has: FaceColor;
	  })
	| (Blocked &
	  {
			why: "box";
			c: PieceColor;
	  })
	| (Blocked &
	  {
			why: "stuck";
			c: PieceColor;
	  })
	| (Blocked &
	  {
			why: "door";
			c: PieceColor;
	  })
	| (Blocked &
	  {
			why: "misaligned";
	  })
	| (Blocked &
	  {
			why: "heavy";
	  });
export type MoveSuccess =
{
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
	/** Present when the press merged a loose cube instead of rolling. */
	merged?: true;
};
export type MoveResult = MoveFailure | MoveSuccess;
