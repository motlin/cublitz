import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import type {Plugin} from "vite-plus";
import {MANIFEST, PRECACHE_URLS} from "../src/pwa/manifest.ts";

export const SW_FILE = "sw.js";
const PLACEHOLDER = "__CUBLITZ_SW_VERSION__";

/** A version for the build: a hash of every file the worker keeps, in order, so any change to one is a new version. */
export function buildVersion(files: (string | Uint8Array)[]): string
{
	const hash = createHash("sha256");
	for (const file of files)
	{
		const bytes = typeof file === "string" ? Buffer.from(file, "utf8") : file;
		hash.update(`${bytes.length}:`).update(bytes);
	}
	return hash.digest("hex").slice(0, 16);
}

/**
 * Builds src/pwa/sw.ts to dist/sw.js and writes dist/manifest.webmanifest. It runs after the page is final, and puts
 * a hash of the page, the manifest and the icons into the worker as its cache version. The icons and the _headers
 * file for Cloudflare are copied from public/ as they are.
 */
export function serviceWorker(): Plugin
{
	return {
		name: "service-worker",
		apply: "build",
		enforce: "post",
		buildStart()
		{
			this.emitFile(
				{
					type: "chunk",
					id: resolve("src/pwa/sw.ts"),
					fileName: SW_FILE,
				},
			);
		},
		generateBundle(_options, bundle)
		{
			const page = bundle["index.html"];
			const worker = bundle[SW_FILE];
			if (page?.type !== "asset") throw new Error("index.html is missing from the bundle");
			if (worker?.type !== "chunk") throw new Error(`${SW_FILE} is missing from the bundle`);
			if (worker.imports.length > 0 || /^\s*(?:import|export)\b/m.test(worker.code))
				throw new Error(`${SW_FILE} has to be a classic script, with nothing shared with the page`);
			const manifest = `${JSON.stringify(MANIFEST, null, "\t")}\n`;
			const icons = PRECACHE_URLS.filter((url) => url.startsWith("/icons/")).map((url) =>
				readFileSync(`public${url}`),
			);
			const version = buildVersion([String(page.source), manifest, ...icons]);
			if (!worker.code.includes(PLACEHOLDER)) throw new Error(`${SW_FILE} lost its version placeholder`);
			worker.code = worker.code.replaceAll(PLACEHOLDER, version);
			this.emitFile(
				{
					type: "asset",
					fileName: "manifest.webmanifest",
					source: manifest,
				},
			);
		},
	};
}
