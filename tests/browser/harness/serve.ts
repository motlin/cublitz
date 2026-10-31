import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {extname, join, normalize, resolve} from "node:path";

process.title = "cublitz-harness";

// Serves the untouched original next to a build, so the two can be compared from one origin scheme.
const root = resolve(import.meta.dirname, "../../..");
const distDir = resolve(process.env["CUBLITZ_DIST_DIR"] ?? join(root, "dist"));
const port = Number(process.env["CUBLITZ_PORT"] ?? "4817");
const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
};

createServer(async (request, response) => {
	const pathname = normalize(new URL(request.url ?? "/", "http://x").pathname);
	const file =
		pathname === "/legacy/original.html"
			? join(root, "legacy/original.html")
			: join(distDir, pathname === "/" ? "index.html" : pathname);
	try {
		const body = await readFile(file);
		response.writeHead(200, {
			"content-type": TYPES[extname(file)] ?? "application/octet-stream",
			"cache-control": "no-store",
		});
		response.end(body);
	} catch {
		response.writeHead(404).end("not found");
	}
}).listen(port, "127.0.0.1", () => console.log(`serving ${distDir} on ${port}`));
