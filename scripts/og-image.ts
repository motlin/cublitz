import {pathToFileURL} from "node:url";
import {chromium} from "@playwright/test";

// Renders public/og.png, the 1200x630 image link previews show, from the built title screen itself: its spinning
// cube stopped at one angle, its floor grid and its wordmark, with the buttons and links hidden. The fonts come from
// Google Fonts, so this needs the network. Run it with `just og-image` after changing the title screen.
const OUT = "public/og.png";
const PAGE = pathToFileURL("dist/index.html").href;

// Sizes the title screen up to fill the card. The angle shows the red, orange and yellow faces, the same three the
// spin passes through on the title screen.
const CARD_CSS = `
	html, body { margin: 0; overflow: hidden; background: var(--ground); }
	#titleView { position: fixed; inset: 0; min-height: 0; padding: 0; gap: 0; border-radius: 0; justify-content: center; }
	#titleView .title-sound, #titleView .title-actions, #titleView .title-progress, #titleView .title-links, #titleView .title-keys { display: none; }
	#titleView .title-stage { --s: 190px; height: calc(var(--s) * 1.62); }
	#titleView .tcube { animation: none; transform: rotateX(-24deg) rotateY(146deg); }
	#titleView .tf { border-radius: 16px; font-size: 54px; }
	#titleView .tshadow { height: 28px; filter: blur(14px); }
	#titleView .title-floor::before { top: 58%; background-size: 84px 84px; }
	#titleView .title-name { font-size: 196px; margin: 4px 0 0; }
`;

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
	await page.goto(
		PAGE,
		{
			waitUntil: "networkidle",
		},
	);
	await page.locator("#titleView").waitFor();
	await page.addStyleTag(
		{
			content: CARD_CSS,
		},
	);
	const loaded = await page.evaluate(async () =>
	{
		const faces = await Promise.all(
			['196px "Bagel Fat One"'].map(async (font) => document.fonts.load(font, "Cublitz")),
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
