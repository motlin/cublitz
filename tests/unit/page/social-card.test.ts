import {readFileSync} from "node:fs";
import {expect, test} from "vite-plus/test";

const read = (path: string): Buffer => readFileSync(new URL(`../../../${path}`, import.meta.url));
const head = /<head>([\s\S]*?)<\/head>/.exec(read("index.html").toString("utf8"))?.[1] ?? "";

const ORIGIN = "https://cublitz.motlin.com";
const DESCRIPTION =
	"Roll a cube through puddles of paint to color its faces, then bring it to the target past gates, switches, boxes and doors.";

// Crawlers for link previews read the HTML as served and run no script, so the tags have to be in the page's own head.
test("the page's head carries the tags link previews read", () =>
{
	const tags = [...head.matchAll(/<meta (name|property)="([^"]+)" content="([^"]*)">/g)].map(([, , key, content]) => [
		key,
		content,
	]);
	expect(tags).toStrictEqual([
		["description", DESCRIPTION],
		["og:type", "website"],
		["og:site_name", "Cublitz"],
		["og:title", "Cublitz: a rolling paint puzzle"],
		["og:description", DESCRIPTION],
		["og:url", `${ORIGIN}/`],
		["og:image", `${ORIGIN}/og.png`],
		["og:image:width", "1200"],
		["og:image:height", "630"],
		["og:image:alt", "An isometric cube with red, blue and yellow faces beside the word Cublitz"],
		["twitter:card", "summary_large_image"],
		["twitter:title", "Cublitz: a rolling paint puzzle"],
		["twitter:description", DESCRIPTION],
		["twitter:image", `${ORIGIN}/og.png`],
	]);
});

test("the preview image is a 1200 by 630 PNG", () =>
{
	const png = read("public/og.png");
	expect(
		{
			signature: png.subarray(0, 8).toString("hex"),
			width: png.readUInt32BE(16),
			height: png.readUInt32BE(20),
		},
	).toStrictEqual(
		{
			signature: "89504e470d0a1a0a",
			width: 1200,
			height: 630,
		},
	);
});
