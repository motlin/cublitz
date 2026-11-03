import {readFileSync} from "node:fs";

// The owner's approved changes from legacy/original.html, and the only differences the differential tests allow.
// Each is an exact edit to the original's text, so everything else about the expected page stays the original.
export type IntentionalDivergence = {name: string; from: string; to: string};

export function readOriginalHtml(): string {
	return readFileSync(new URL("../../legacy/original.html", import.meta.url), "utf8");
}

// The original's text for a campaign level, from its line up to the next level's line.
const levelText = (name: string, nextName: string): string => {
	const html = readOriginalHtml();
	const start = html.indexOf(` {"name":"${name}"`);
	const end = html.indexOf(` {"name":"${nextName}"`, start);
	if (start < 0 || end < 0) throw new Error(`The original has no level ${name} followed by ${nextName}`);
	return html.slice(start, end);
};
const CHECKPOINTS = levelText("Checkpoints", "Crown");
const CROWN = levelText("Crown", "Stripes");

// The end of the original's campaign, where a player's level is added after Clean Sweep.
const CAMPAIGN_END = `  "         ......cX"]}\n];`;
const STINKLEY_TINKLES = ` {"name":"Stinkley tinkles","tip":"Go solid red for the switch, then wash it off and push the white box onto the white button. The cyan boxes never move.","k":{"1":["box",
  "c"],"2":["button",
  "w"],"3":["door",
  "r"],"4":["box",
  "w"],"5":["door",
  "w"],"6":["switch",
  "r"]},"par":67,"map":[
  "1112........",
  "1..1111111..",
  "S.rZ34.....1",
  "1..11151.1.1",
  "11.111.1...1",
  "116111X11111"]}
`;

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
		name: "The editor has one share box that shows the code, copies it or a link, and loads a pasted code or link, checked as strictly as a link",
		from: `$('edImport').onclick = () => {
  try {
    const L = decodeLevel($('edImportText').value);
    loadIntoEditor(L, L.name || 'Imported', null);
    $('edImportText').value = '';
    $('edImportNote').textContent = \`Loaded “\${ED.name}”.\`;
    renderEditor();
  } catch (e) { $('edImportNote').textContent = 'That code didn’t work. Paste the whole thing, starting with CUBLITZ:'; }
};`,
		to: `{
  const box = $('edCode');
  box.readOnly = false;
  box.placeholder = 'Paste a CUBLITZ: code or link, then press Load';
  $('edImportText').closest('label').remove();
  $('edCopy').insertAdjacentHTML('afterend', '<button class="act" id="edCopyLink" type="button">Copy link</button>');
  $('edCopyLink').after($('edImport'));
  $('edImportNote').closest('.row').remove();
  let clickSelects = false;
  const selectAll = () => box.setSelectionRange(0, box.value.length);
  box.addEventListener('pointerdown', () => { clickSelects = document.activeElement !== box; });
  box.addEventListener('focus', () => { box.typed = false; selectAll(); });
  box.addEventListener('click', () => { if (clickSelects) selectAll(); clickSelects = false; });
  box.addEventListener('input', () => { box.typed = true; });
  box.addEventListener('blur', () => { box.typed = false; });
  $('edCopyLink').addEventListener('click', () => {
    const code = box.value; if (!code) return;
    const link = location.origin + location.pathname + '?' + code;
    const sel = () => { box.value = link; box.focus(); box.setSelectionRange(0, link.length); $('edCodeNote').textContent = 'Selected. Copy the link from the box.'; };
    try { navigator.clipboard.writeText(link).then(() => { $('edCodeNote').textContent = 'Copied.'; }, sel); } catch (e) { sel(); }
  });
  const one = (v, letters) => typeof v === 'string' && v.length === 1 && letters.includes(v);
  const isRecord = v => typeof v === 'object' && v !== null && !Array.isArray(v);
  const entryOk = e => Array.isArray(e) && e.length === 2 && (e[0] === 'wgate' ? one(e[1], 'tbnsew') : e[0] === 'cube' ? e[1] === 'w' : ['box', 'switch', 'button', 'door'].includes(e[0]) && one(e[1], 'roygcbpw'));
  const strict = L => {
    const { name, map, k = {}, need = {} } = L;
    if (!Object.keys(L).every(key => ['name', 'map', 'k', 'need'].includes(key))) return false;
    if (typeof name !== 'string' || !name.trim() || name.length > 100) return false;
    if (!isRecord(k) || !isRecord(need)) return false;
    if (!Object.entries(k).every(([ch, e]) => [...ch].length === 1 && !' SX'.includes(ch) && entryOk(e))) return false;
    if (!Object.entries(need).every(([f, c]) => one(f, 'tbnsew') && one(c, 'roygcbp'))) return false;
    if (map.length > 12 || map.some(row => [...row].length > 18)) return false;
    const cells = map.flatMap(row => [...row]);
    if (!cells.every(ch => ' .SXWZroygcbpROYGCBP'.includes(ch) || Object.hasOwn(k, ch))) return false;
    return cells.filter(ch => ch === 'S').length === 1 && cells.includes('X');
  };
  const fromCode = text => {
    const s = text.trim(), q = s.indexOf('?');
    let L;
    if (q >= 0 && !s.startsWith('{')) {
      const code = s.slice(q + 1).split('&').find(p => p.startsWith('CUBLITZ:'));
      if (code === undefined) throw new Error('bad');
      L = decodeLevel('CUBLITZ:' + decodeURIComponent(code.slice(8)));
    } else L = decodeLevel(s);
    if (!strict(L)) throw new Error('bad');
    return L;
  };
  $('edImport').onclick = () => {
    try {
      const L = fromCode(box.value);
      loadIntoEditor(L, L.name || 'Imported', null);
      box.typed = false;
      renderEditor();
      $('edCodeNote').textContent = \`Loaded “\${ED.name}”.\`;
    } catch (e) { $('edCodeNote').textContent = 'That code didn’t work. Paste the whole thing, starting with CUBLITZ:'; }
  };
}`,
	},
	{
		name: "Editing the level leaves the share box alone while the player types in it",
		from: "  $('edCode').value = r.level ? encodeLevel(r.level) : '';\n",
		to: "  if (!$('edCode').typed) $('edCode').value = r.level ? encodeLevel(r.level) : '';\n",
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
	{
		name: "Crown is level 5 and Checkpoints is level 6, the reverse of the original",
		from: CHECKPOINTS + CROWN,
		to: CROWN + CHECKPOINTS,
	},
	{
		name: "Next level goes to the first level in the campaign not yet beaten, so a save that beat Checkpoints before Crown goes back to Crown",
		from: "S.lvl < 0 ? setMode('edit') : loadLevel(Math.min(S.lvl + 1, LEVELS.length - 1));",
		to: "S.lvl < 0 ? setMode('edit') : loadLevel((next => next < 0 ? Math.min(S.lvl + 1, LEVELS.length - 1) : next)(LEVELS.findIndex(L => !progress[L.name])));",
	},
	{
		name: "A hot-reload snapshot holds its level's name",
		from: "{ lvl:S.lvl, st:S.st, hist:S.hist, mode }",
		to: "{ lvl:S.lvl, name:S.L.name, st:S.st, hist:S.hist, mode }",
	},
	{
		name: "A hot-reload snapshot is restored only onto the level with its name",
		from: "LEVELS[data.lvl] && unlocked(data.lvl)",
		to: "LEVELS[data.lvl] && LEVELS[data.lvl].name === data.name && unlocked(data.lvl)",
	},
	{
		name: "Stinkley tinkles, a level from a player, is level 31, after Clean Sweep",
		from: CAMPAIGN_END,
		to: `  "         ......cX"]},\n${STINKLEY_TINKLES}];`,
	},
];

export function withIntentionalDivergences(html: string): string {
	return INTENTIONAL_DIVERGENCES.reduce((page, {name, from, to}) => {
		if (page.split(from).length !== 2) throw new Error(`"${name}" must match the original exactly once`);
		return page.replace(from, () => to);
	}, html);
}

export const readExpectedHtml = (): string => withIntentionalDivergences(readOriginalHtml());
