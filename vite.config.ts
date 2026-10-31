import {readFileSync} from "node:fs";
import {defineConfig, type Plugin} from "vite";

const APP_TAG = '<script type="module" src="/src/app.js"></script>';

// The shipped page has to stay the original single file. Vite would minify the inline CSS and move the
// script to a deferred external file, which can paint the page before the game has set it up. So the
// raw page goes out as written, with the bundled code as a classic inline script in its original spot.
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
			const raw = readFileSync("index.html", "utf8");
			if (raw.split(APP_TAG).length !== 2) throw new Error(`index.html must contain ${APP_TAG} exactly once`);
			page.source = raw.replace(APP_TAG, () => `<script>\n${chunk.code}</script>`);
			delete bundle[chunk.fileName];
		},
	};
}

export default defineConfig({
	plugins: [shipSingleFilePage()],
	build: {outDir: "dist", emptyOutDir: true, minify: false, target: "esnext", modulePreload: {polyfill: false}},
});
