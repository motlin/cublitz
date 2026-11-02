import {readFileSync} from "node:fs";
import {expect, test} from "vite-plus/test";
import {APPLE_TOUCH_ICON, MANIFEST, PRECACHE_URLS} from "../../../src/pwa/manifest.ts";
import {HEAD_TAGS} from "../../../src/ui/pwa.ts";

const read = (path: string): Buffer => readFileSync(new URL(`../../../${path}`, import.meta.url));

// A PNG's width and height sit in its IHDR chunk, right after the 8-byte signature and the chunk's length and type.
const pngSize = (bytes: Buffer): string => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;

test("the manifest installs a standalone app in the game's colors, in either orientation", () =>
{
	expect(MANIFEST).toStrictEqual(
		{
			id: "/",
			name: "Cublitz",
			short_name: "Cublitz",
			description: "A rolling paint puzzle",
			start_url: "/",
			scope: "/",
			display: "standalone",
			orientation: "any",
			background_color: "#161923",
			theme_color: "#161923",
			icons: [
				{
					src: "/icons/icon-192.png",
					sizes: "192x192",
					type: "image/png",
					purpose: "any",
				},
				{
					src: "/icons/icon-512.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "any",
				},
				{
					src: "/icons/icon-maskable-512.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "maskable",
				},
			],
		},
	);
});

test("every icon the manifest names is a PNG of the size it claims", () =>
{
	expect(MANIFEST.icons.map(({src}) => pngSize(read(`public${src}`)))).toStrictEqual(
		MANIFEST.icons.map(({sizes}) => sizes),
	);
	expect(pngSize(read("public/icons/apple-touch-icon.png"))).toBe("180x180");
});

test("the page links the manifest and gives Safari the tags it reads for a home screen app", () =>
{
	expect(HEAD_TAGS).toStrictEqual([
		[
			"link",
			{
				rel: "manifest",
				href: "/manifest.webmanifest",
			},
		],
		[
			"meta",
			{
				name: "theme-color",
				content: "#161923",
			},
		],
		[
			"meta",
			{
				name: "mobile-web-app-capable",
				content: "yes",
			},
		],
		[
			"meta",
			{
				name: "apple-mobile-web-app-capable",
				content: "yes",
			},
		],
		[
			"meta",
			{
				name: "apple-mobile-web-app-status-bar-style",
				content: "black-translucent",
			},
		],
		[
			"meta",
			{
				name: "apple-mobile-web-app-title",
				content: "Cublitz",
			},
		],
		[
			"link",
			{
				rel: "apple-touch-icon",
				href: "/icons/apple-touch-icon.png",
			},
		],
	]);
	expect(HEAD_TAGS.flatMap(([, {href}]) => (href ? [href] : []))).toStrictEqual([
		"/manifest.webmanifest",
		APPLE_TOUCH_ICON,
	]);
	expect(HEAD_TAGS[1]?.[1]["content"]).toBe(MANIFEST.theme_color);
});

test("the worker keeps the page, the manifest and every icon for offline play", () =>
{
	expect(PRECACHE_URLS).toStrictEqual([
		"/",
		"/manifest.webmanifest",
		"/icons/icon-192.png",
		"/icons/icon-512.png",
		"/icons/icon-maskable-512.png",
		"/icons/apple-touch-icon.png",
	]);
});

test("Cloudflare serves the manifest as a manifest and never lets the worker go stale", () =>
{
	expect(read("public/_headers").toString("utf8")).toBe(`/sw.js
  Cache-Control: no-cache
  Content-Type: text/javascript; charset=utf-8

/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
  Cache-Control: no-cache
`);
});
