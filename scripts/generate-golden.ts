import {writeFileSync} from "node:fs";
import {generateInfiniteGolden, generateSolveGolden} from "../tests/support/golden.ts";
import {loadExpectedEngine, loadOriginalEngine} from "../tests/support/original-engine.ts";

const engine = loadOriginalEngine();
const write = (name: string, value: unknown): void => {
	writeFileSync(new URL(`../tests/golden/${name}`, import.meta.url), `${JSON.stringify(value, null, "\t")}\n`);
};

write("solve.json", generateSolveGolden(engine));
write("infinite.json", generateInfiniteGolden(engine));
write("infinite-post-fix.json", generateInfiniteGolden(loadExpectedEngine()));
