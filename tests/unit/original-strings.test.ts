import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {parseAst} from "vite";
import {expect, test} from "vite-plus/test";
import {readExpectedHtml} from "../support/intentional-divergences.ts";

// Every string the original script holds has to survive in the source, including messages on failure paths
// that a browser session rarely reaches.
const stringsIn = (code: string, options: Parameters<typeof parseAst>[1]): Set<string> => {
	const found = new Set<string>();
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) node.forEach(visit);
		else if (node && typeof node === "object") {
			const {type, value} = node as {type?: string; value?: unknown};
			if (type === "Literal" && typeof value === "string") found.add(value);
			if (type === "TemplateElement") found.add((value as {cooked: string}).cooked);
			Object.values(node).forEach(visit);
		}
	};
	visit(parseAst(code, options));
	return found;
};

const sourceFiles = (dir: string): string[] =>
	readdirSync(dir, {recursive: true, encoding: "utf8"})
		.filter((file) => file.endsWith(".ts"))
		.map((file) => join(dir, file));

// Never shown to a player: letters the original iterates over, and a typeof check, that the source spells as
// typed lists instead.
const RESTRUCTURED = ["NSEW", "function", "btnsew", "bt"];

test("the source holds every string in the original script", () => {
	const script = /(?<=<script>\n)[\s\S]*(?=<\/script>)/.exec(readExpectedHtml())?.[0] ?? "";
	const original = stringsIn(script, {sourceType: "script"});
	const source = new Set(
		sourceFiles("src").flatMap((file) => [...stringsIn(readFileSync(file, "utf8"), {lang: "ts"})]),
	);
	expect([...original].filter((text) => !source.has(text))).toStrictEqual(RESTRUCTURED);
	expect(original.size > 500).toBe(true);
});
