import {readdirSync} from "node:fs";
import {afterEach, expect, test, vi} from "vite-plus/test";

const BROWSER_GLOBALS = [
	"document",
	"window",
	"localStorage",
	"location",
	"history",
	"navigator",
	"matchMedia",
	"getComputedStyle",
	"addEventListener",
	"ResizeObserver",
	"requestAnimationFrame",
];
afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

// The modules call each other in cycles, which is only safe because nothing runs until main.ts calls init.
test("importing every ui module touches nothing in the browser", async () => {
	const touched: string[] = [];
	const trap = (name: string) =>
		new Proxy(() => {}, {
			get: (_target, property) => touched.push(`${name}.${String(property)}`),
			apply: () => touched.push(`${name}()`),
			construct: () => {
				touched.push(`new ${name}()`);
				return {};
			},
		});
	for (const name of BROWSER_GLOBALS) vi.stubGlobal(name, trap(name));
	const modules = readdirSync("src/ui").toSorted();
	for (const file of modules) await import(`../../../src/ui/${file}`);
	expect(modules).toStrictEqual([
		"board.ts",
		"dom.ts",
		"editor-grid.ts",
		"editor.ts",
		"hint.ts",
		"hud.ts",
		"infinite-mode.ts",
		"input.ts",
		"modes.ts",
		"overlays.ts",
		"palette.ts",
		"play.ts",
		"session.ts",
		"sfx.ts",
		"solution.ts",
		"storage.ts",
		"text.ts",
		"tips.ts",
		"title.ts",
	]);
	expect(touched).toStrictEqual([]);
});
