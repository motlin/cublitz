import {readFileSync} from "node:fs";
import {defineConfig, type Plugin} from "vite";

// Vite rewrites inline <style> tags on its way through (minifying the CSS). While index.html is the
// original game, the shipped page has to stay byte-identical, so its raw source replaces the output.
function shipIndexHtmlVerbatim(): Plugin {
	return {
		name: "ship-index-html-verbatim",
		enforce: "post",
		generateBundle(_options, bundle) {
			const page = bundle["index.html"];
			if (page?.type !== "asset") throw new Error("index.html is missing from the bundle");
			page.source = readFileSync("index.html");
		},
	};
}

export default defineConfig({
	plugins: [shipIndexHtmlVerbatim()],
	build: {outDir: "dist", emptyOutDir: true},
});
