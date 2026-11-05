import {readFile} from "node:fs/promises";
import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {stripTypeScriptTypes} from "node:module";
import {extname, join, normalize, resolve} from "node:path";

process.title = "cublitz-harness";

// Serves a build, plus src/core/ as plain JavaScript modules so a test can run the game's pure code in any browser.
const root = resolve(import.meta.dirname, "../../..");
const distDir = resolve(process.env["CUBLITZ_DIST_DIR"] ?? join(root, "dist"));
const port = Number(process.env["CUBLITZ_PORT"] ?? "4817");
const TYPES: Record<string, string> =
{
	".html": "text/html; charset=utf-8",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".webmanifest": "application/manifest+json",
	".svg": "image/svg+xml",
	".png": "image/png",
};

const respond = async (request: IncomingMessage, response: ServerResponse): Promise<void> =>
{
	const pathname = normalize(new URL(request.url ?? "/", "http://x").pathname);
	if (pathname.startsWith("/src/core/") && pathname.endsWith(".ts"))
	{
		try
		{
			const source = await readFile(join(root, pathname), "utf8");
			response.writeHead(
				200,
				{
					"content-type": "text/javascript; charset=utf-8",
					"cache-control": "no-store",
				},
			);
			response.end(stripTypeScriptTypes(source));
		}
		catch
		{
			response.writeHead(404).end("not found");
		}
		return;
	}
	const file = join(distDir, pathname === "/" ? "index.html" : pathname);
	try
	{
		const body = await readFile(file);
		response.writeHead(
			200,
			{
				"content-type": TYPES[extname(file)] ?? "application/octet-stream",
				"cache-control": "no-store",
			},
		);
		response.end(body);
	}
	catch
	{
		response.writeHead(404).end("not found");
	}
};

createServer((request, response) =>
{
	void respond(request, response);
}).listen(port, "127.0.0.1", () =>
{
	console.log(`serving ${distDir} on ${port}`);
});
