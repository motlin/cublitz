import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const EXPECTED = "a52a636cfe3705e3cc10d3bc6fe06f3b6a8b9b60fe3035d38f2e2181fd889fdb";
const actual = createHash("sha256").update(readFileSync("legacy/original.html")).digest("hex");
if (actual !== EXPECTED)
{
	console.error(`legacy/original.html has been edited: sha256 ${actual}, expected ${EXPECTED}`);
	process.exit(1);
}
console.log("legacy/original.html is byte-identical to the source artifact");
