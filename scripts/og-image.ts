import {readFileSync} from "node:fs";
import {chromium} from "@playwright/test";

// Renders public/og.png, the 1200x630 image link previews show, with the game's colors and fonts. The fonts come
// from Google Fonts, so this needs the network. Run it with `just og-image` after changing the card.
const OUT = "public/og.png";
const cube = readFileSync("scripts/icons/icon.svg", "utf8")
	.replace(/<rect[^>]*\/>/, "")
	.replace('viewBox="0 0 512 512"', 'viewBox="60 40 392 432" width="400" height="441"');
const letters = "Cublitz"
	.split("")
	.map((letter, i) => `<span style="color: var(--c${i})">${letter}</span>`)
	.join("");

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=Outfit:wght@500&display=block">
<style>
	:root {
		--c0: #ef5a52; --c1: #ff8a3d; --c2: #f3c23e; --c3: #3fc489; --c4: #38d3e2; --c5: #4b8cf2; --c6: #a77cf4;
	}
	html, body { margin: 0; }
	body {
		width: 1200px; height: 630px; overflow: hidden;
		background:
			radial-gradient(ellipse 70% 80% at 28% 55%, #222738 0%, transparent 70%),
			#161923;
		display: flex; align-items: center; gap: 56px; padding: 0 80px; box-sizing: border-box;
		font-family: "Outfit", system-ui, sans-serif;
	}
	.stage { position: relative; flex: none; }
	.stage svg { display: block; filter: drop-shadow(0 28px 30px rgba(0, 0, 0, 0.45)); }
	.words { display: flex; flex-direction: column; gap: 18px; }
	h1 { margin: 0; font-family: "Bagel Fat One", system-ui; font-weight: 400; font-size: 172px; line-height: 0.9; letter-spacing: 0.01em; }
	p { margin: 0 0 0 6px; color: #9298ad; font-size: 44px; font-weight: 500; }
</style>
</head>
<body>
	<div class="stage">${cube}</div>
	<div class="words">
		<h1>${letters}</h1>
		<p>a rolling paint puzzle</p>
	</div>
</body>
</html>`;

const browser = await chromium.launch();
try
{
	const page = await browser.newPage(
		{
			viewport:
			{
				width: 1200,
				height: 630,
			},
		},
	);
	await page.setContent(
		html,
		{
			waitUntil: "networkidle",
		},
	);
	const loaded = await page.evaluate(async () =>
	{
		const faces = await Promise.all(
			['172px "Bagel Fat One"', '500 44px "Outfit"'].map(async (font) => document.fonts.load(font, "Cublitz")),
		);
		return faces.every((face) => face.length > 0);
	});
	if (!loaded) throw new Error("A Google font did not load, so the card would show a fallback font");
	await page.screenshot(
		{
			path: OUT,
		},
	);
	console.log(`wrote ${OUT}`);
}
finally
{
	await browser.close();
}
