import {readFileSync} from "node:fs";

// The owner's approved changes from legacy/original.html, and the only differences the differential tests allow.
// Each is an exact edit to the original's text, so everything else about the expected page stays the original.
export type IntentionalDivergence = {name: string; from: string; to: string};

export const INTENTIONAL_DIVERGENCES: IntentionalDivergence[] = [
	{
		name: "Skip canvas is disabled on the infinite win card",
		from: "  if (!on || !run) return;\n  const rating = infRating();",
		to: "  if (!on || !run) return;\n  $('infSkip').disabled = S.won;\n  const rating = infRating();",
	},
	{
		name: "The white gates tip says a paint remover takes paint off",
		from: "Paint never comes off, so every puddle",
		to: "Paint stays on until a paint remover wipes it, so every puddle",
	},
	{
		name: "Level 23's tip says nothing on that level takes paint off",
		from: "top bare for the second. Paint never comes off.",
		to: "top bare for the second. Nothing here takes paint off.",
	},
	{
		name: "Infinite levels shuffle the palette with the seeded generator, so a seed gives the same levels in every engine",
		from: "const palette = [...'roygcbp'].sort(() => R() - 0.5).slice(0, tier >= 4 ? 3 : 2);",
		to: "const shuffled = [...'roygcbp'];\n  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }\n  const palette = shuffled.slice(0, tier >= 4 ? 3 : 2);",
	},
	{
		name: "The level bar links to the merge levels after the campaign",
		from: "    nav.appendChild(b);\n  });\n}\n\nfunction setStatus",
		to: "    nav.appendChild(b);\n  });\n  ['Stick Together', 'Mind the Gap', 'Side by Side'].forEach((name, j) => {\n    const b = document.createElement('button');\n    b.textContent = `M${j + 1}`;\n    b.title = name;\n    b.style.cssText = 'font-family:var(--font-mono);font-weight:700;font-size:13px;width:36px;height:32px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--muted);cursor:pointer;';\n    nav.appendChild(b);\n  });\n}\n\nfunction setStatus",
	},
	{
		name: "The editor's tool bar has a Loose cube tool",
		from: "}).join('');\n$('edTools').addEventListener",
		to: '}).join(\'\') + `<button type="button" data-tool="cube" aria-pressed="false"><span class="ec loose" style="--ec:20px;--pc:var(--blue);${\'background:linear-gradient(#1b1e29,#1b1e29) center/12% 44% no-repeat,linear-gradient(#1b1e29,#1b1e29) center/44% 12% no-repeat,linear-gradient(var(--clay),var(--clay)) center/72% 72% no-repeat,linear-gradient(135deg,var(--tile-hi),var(--tile))\'}"></span>Loose cube</button>`;\n$(\'edTools\').addEventListener',
	},
	{
		name: "On a phone-sized touch screen, play is one fixed screen that fits the level, and touch gestures go by finger count",
		from: "$('viewport').addEventListener('pointerdown', e => { touch0 = [e.clientX, e.clientY]; });",
		to: "$('viewport').addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && matchMedia('(pointer: coarse) and (max-width: 932px), (pointer: coarse) and (max-height: 500px)').matches) return; touch0 = [e.clientX, e.clientY]; });",
	},
	{
		name: "The editor has a Copy link button beside Copy code",
		from: "$('edImport').onclick = () => {",
		to: `$('edCopy').insertAdjacentHTML('afterend', '<button class="act" id="edCopyLink" type="button">Copy link</button>');
$('edCodeNote').insertAdjacentHTML('afterend', '<input id="edLinkText" type="text" readonly hidden aria-label="Share link" style="flex:1 1 100%;min-width:0">');
$('edLinkText').addEventListener('blur', e => { e.target.hidden = true; });
$('edCopyLink').addEventListener('click', () => {
  const code = $('edCode').value; if (!code) return;
  const link = location.origin + location.pathname + '?' + code;
  const sel = () => { const box = $('edLinkText'); box.value = link; box.hidden = false; box.focus(); box.setSelectionRange(0, link.length); $('edCodeNote').textContent = 'Selected. Copy the link from the box.'; };
  try { navigator.clipboard.writeText(link).then(() => { $('edLinkText').hidden = true; $('edCodeNote').textContent = 'Copied.'; }, sel); } catch (e) { sel(); }
});
$('edImport').onclick = () => {`,
	},
	{
		name: "The page can be installed as an app that plays offline",
		from: "window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});\n",
		to: `window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
[
  ['link', { rel:'manifest', href:'/manifest.webmanifest' }],
  ['meta', { name:'theme-color', content:'#161923' }],
  ['meta', { name:'mobile-web-app-capable', content:'yes' }],
  ['meta', { name:'apple-mobile-web-app-capable', content:'yes' }],
  ['meta', { name:'apple-mobile-web-app-status-bar-style', content:'black-translucent' }],
  ['meta', { name:'apple-mobile-web-app-title', content:'Cublitz' }],
  ['link', { rel:'apple-touch-icon', href:'/icons/apple-touch-icon.png' }],
].forEach(([tag, attrs]) => {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value));
  document.head.appendChild(el);
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
`,
	},
	{
		name: "The rolling tip is two short sentences",
		from: "'Use the arrow keys, WASD, or swipe on a phone to roll your cube one tile at a time. Each roll tips it over an edge, so a different side ends up on the floor. It can only roll onto tiles, never off the edge. Reach the glowing target to finish the level.'",
		to: "'Swipe or use the arrows to roll. Roll the cube to the target.'",
	},
	{
		name: "The wet paint tip is shorter",
		from: "body:'When your cube rolls onto a puddle, the face touching the floor gets painted that color. The paint stays on that face until another puddle covers it. The face map on the right shows every side.",
		to: "body:'Roll onto a puddle and the face touching the floor takes its color. It stays that color until another puddle covers it. The face map on the right shows every side.",
	},
	{
		name: "The color gates tip is shorter",
		from: "body:'You can’t pass a colored tile until you paint your cube the same color. The face that lands on the gate has to match it, and every roll turns a different face down, so count your rolls.",
		to: "body:'A colored gate only lets you through if the face that lands on it is that color. Every roll turns a different face down, so count your rolls.",
	},
	{
		name: "The picky targets tip is shorter",
		from: "body:'A colored target only accepts your cube with that color on top. A colored bar on one edge of the target means that side of the cube needs that color too. The face map on the right shows every side of your cube.",
		to: "body:'A colored target wants that color on top. A colored bar on one edge means that side of the cube needs the color too. The face map on the right shows every side.",
	},
	{
		name: "The switches tip is shorter",
		from: "body:'Switches only work for a cube painted completely in their color, all six faces. Once your cube is solid it glows. Roll it onto a switch of the same color to flip it, and every door of that color opens.",
		to: "body:'A switch only works for a cube painted its color on all six faces. A solid cube glows. Roll it onto a matching switch to flip it, and every door of that color opens.",
	},
	{
		name: "The white gates tip is shorter",
		from: "body:'White gates want a bare, unpainted side. A plain one needs a bare face down. One with an arrow needs the side it points to still bare when you land, and one with a ring needs a bare top. Paint stays on until a paint remover wipes it, so every puddle you cross uses up a white face. A solid cube can never get through.",
		to: "body:'White gates want a bare side. A plain one needs a bare face down. An arrow means the side it points to must still be bare when you land, and a ring means a bare top. Paint stays on until a paint remover wipes it, so every puddle you cross uses up a white face. A solid cube never gets through.",
	},
	{
		name: "The paint remover tip is shorter",
		from: "body:'Roll onto a paint remover and every face of your cube is wiped back to bare, all at once. Use it when puddles or a solid coat have used up the bare sides a white gate needs. It also ends a solid coat, so finish with switches and boxes first.",
		to: "body:'A paint remover wipes every face of your cube back to bare at once. Use it when puddles or a solid coat have used up the bare sides a white gate needs. It ends a solid coat too, so finish with switches and boxes first.",
	},
	{
		name: "The white pieces tip is shorter",
		from: "body:'A cube with no paint on any face counts as white. It doesn’t glow or act like a solid cube, but it can flip white switches, hold down white buttons and push white boxes. If you pick up paint, a paint remover makes you white again.",
		to: "body:'A cube with no paint on any face counts as white. It doesn’t glow or act solid, but it can flip white switches, hold down white buttons and push white boxes. Picked up paint? A paint remover makes you white again.",
	},
	{
		name: "The buttons and boxes tip is shorter",
		from: "body:'A button holds its doors open only while something of its color sits on it. If you step off, the door shuts. A solid cube can push a box of its own color, and a box left on the button keeps the door open for good.",
		to: "body:'A button holds its doors open only while something of its color sits on it. Step off and they shut. A solid cube can push a box of its own color, and a box left on the button keeps the doors open for good.",
	},
	{
		name: "Prism's tip is reworded",
		from: `"tip":"Finish with green on top and blue facing north, after clearing a red gate and a blue wall."`,
		to: `"tip":"Clear a red gate and a blue wall, then finish with green on top and blue facing north."`,
	},
	{
		name: "Two Rooms' tip is reworded",
		from: `"tip":"Red box on the red button, blue box on the blue button. You will need to change color halfway."`,
		to: `"tip":"Red box on the red button, blue box on the blue button. You’ll have to change color halfway."`,
	},
	{
		name: "Ladder's tip is reworded",
		from: `"tip":"Meet three new paints: orange, purple and cyan. The wall runs orange, purple, cyan, orange, so orange has to be on two opposite faces."`,
		to: `"tip":"Three new paints: orange, purple and cyan. The wall runs orange, purple, cyan, orange, so orange goes on two opposite faces."`,
	},
	{
		name: "Spectrum's tip is reworded",
		from: `"tip":"Four faces, four colors. Arrive with cyan on top, orange north, purple south and blue west."`,
		to: `"tip":"Arrive with cyan on top, orange north, purple south and blue west."`,
	},
	{
		name: "Blank Slate's tip is reworded",
		from: `"tip":"White gates want a bare, unpainted face. This one needs a bare face down, and the paint field is in the way."`,
		to: `"tip":"White gates want an unpainted face. This one needs it facing down, and the paint field is in the way."`,
	},
	{
		name: "Eastern Window's tip is reworded",
		from: `"tip":"The arrow on a white gate names the side that must still be bare when you land. Here that is east."`,
		to: `"tip":"A white gate’s arrow points at the side that must still be bare when you land. Here, east."`,
	},
	{
		name: "The infinite mode tip is shorter",
		from: "`Every canvas is freshly generated. Par is ${lv.par}. Undo is allowed, but every roll you make counts toward your score.`",
		to: "`Every canvas is new. Par is ${lv.par}. You can undo, but every roll counts toward your score.`",
	},
	{
		name: "The paint remover hint is shorter",
		from: "Paint you still need, like a color for a gate or a solid coat for a switch, should be used before you get there.",
		to: "Use up any paint you still need first, like a gate's color or a switch's solid coat.",
	},
	{
		name: "The white gate hint no longer says to spend bare faces carefully",
		from: " left, so spend them carefully.`",
		to: " left.`",
	},
];

export function withIntentionalDivergences(html: string): string {
	return INTENTIONAL_DIVERGENCES.reduce((page, {name, from, to}) => {
		if (page.split(from).length !== 2) throw new Error(`"${name}" must match the original exactly once`);
		return page.replace(from, () => to);
	}, html);
}

export const readOriginalHtml = (): string =>
	readFileSync(new URL("../../legacy/original.html", import.meta.url), "utf8");

export const readExpectedHtml = (): string => withIntentionalDivergences(readOriginalHtml());
