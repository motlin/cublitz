import {readFileSync} from "node:fs";
import {defineConfig, type Plugin} from "vite";
import {keepOriginalGlobalScope, topLevelNames} from "./scripts/original-global-scope.ts";
import {inlineStylesheets} from "./scripts/single-file-page.ts";

const APP_TAG = '<script type="module" src="/src/main.ts"></script>';

// Original globals no game code needs under these names: two it never reads, and storage keys that the
// modules keep in one table. Tree shaking and constant inlining would drop them from any source declaration.
const UNUSED_ORIGINAL_GLOBALS = `var ARROW = { N:'↑', S:'↓', E:'→', W:'←' };
var skipArmed = null;
var TIPS_KEY = 'cubist-tips-seen-v1';
var INF_RUN_KEY = 'cublitz-infinite-run-v1', INF_BEST_KEY = 'cublitz-infinite-best-v1';
var DRAFT_KEY = 'cubist-editor-draft-v1', MINE_KEY = 'cubist-my-levels-v1';
var PAL_KEY = 'cubist-colors-v1';
`;

const originalScript = (): string => {
	const script = /(?<=<script>\n)[\s\S]*(?=<\/script>)/.exec(readFileSync("legacy/original.html", "utf8"))?.[0];
	if (!script) throw new Error("legacy/original.html has no inline script");
	return script;
};

// The shipped page has to stay the original single file. Vite would minify the CSS and move it and the
// script to deferred external files, which can paint the page before the game has set it up. So the raw
// page goes out with its CSS back in place and the bundled code as a classic inline script in its spot.
function shipSingleFilePage(): Plugin {
	return {
		name: "ship-single-file-page",
		enforce: "post",
		generateBundle(_options, bundle) {
			const page = bundle["index.html"];
			if (page?.type !== "asset") throw new Error("index.html is missing from the bundle");
			const chunks = Object.values(bundle).filter((output) => output.type === "chunk");
			const [chunk] = chunks;
			if (!chunk || chunks.length !== 1) throw new Error(`Expected one script chunk, got ${chunks.length}`);
			if (/<\/script/i.test(chunk.code)) throw new Error("The script would close its own inline tag");
			const raw = inlineStylesheets(readFileSync("index.html", "utf8"), (path) => readFileSync(path, "utf8"));
			if (raw.split(APP_TAG).length !== 2) throw new Error(`index.html must contain ${APP_TAG} exactly once`);
			const script = keepOriginalGlobalScope(UNUSED_ORIGINAL_GLOBALS + chunk.code, topLevelNames(originalScript()));
			page.source = raw.replace(APP_TAG, () => `<script>\n${script}</script>`);
			for (const output of Object.values(bundle)) if (output !== page) delete bundle[output.fileName];
		},
	};
}

export default defineConfig({
	plugins: [shipSingleFilePage()],
	build: {outDir: "dist", emptyOutDir: true, minify: false, target: "esnext", modulePreload: {polyfill: false}},
});
