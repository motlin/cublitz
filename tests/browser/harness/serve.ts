import {readFile} from "node:fs/promises";
import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {extname, join, normalize, resolve} from "node:path";
import {readExpectedHtml} from "../../support/intentional-divergences.ts";

process.title = "cublitz-harness";

// Serves the untouched original and a build from one origin scheme, plus the page the build is compared with: the
// original with the intentional divergences applied, made in memory so that legacy/ is never written.
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

const respond = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
	const pathname = normalize(new URL(request.url ?? "/", "http://x").pathname);
	if (pathname === "/legacy/expected.html") {
		response.writeHead(200, {"content-type": "text/html; charset=utf-8", "cache-control": "no-store"});
		response.end(readExpectedHtml());
		return;
	}
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
};

createServer((request, response) => {
	void respond(request, response);
}).listen(port, "127.0.0.1", () => {
	console.log(`serving ${distDir} on ${port}`);
});
