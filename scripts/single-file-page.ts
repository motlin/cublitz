// The shipped page has to stay the original single file, so the build writes each stylesheet back into
// the <style> element it came from, in the same spot and with the same bytes.
const STYLESHEETS = [
	{
		path: "src/styles/reset.css",
		inline: (css: string) => `<style>${css.trimEnd()}</style>`,
	},
	{
		path: "src/styles/game.css",
		inline: (css: string) => `<style>\n${css}</style>`,
	},
];

export function inlineStylesheets(html: string, read: (path: string) => string): string
{
	return STYLESHEETS.reduce((page, {path, inline}) =>
	{
		const tag = `<link rel="stylesheet" href="/${path}">`;
		if (page.split(tag).length !== 2) throw new Error(`${tag} must occur exactly once in index.html`);
		return page.replace(tag, () => inline(read(path)));
	}, html);
}

// Vite+'s bundler marks each module with //#region and //#endregion lines. The page has always shipped a plain
// path comment instead, and it stays the same bytes.
export const plainRegionComments = (code: string): string =>
	code.replace(/^\/\/#endregion\n/gm, "").replace(/^\/\/#region /gm, "// ");
