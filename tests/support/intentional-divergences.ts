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
