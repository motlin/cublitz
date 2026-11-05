// The shipped page is one file, so the build writes each stylesheet into a <style> element where its link was.
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

// Vite+'s bundler marks each module with //#region and //#endregion lines. The page ships a plain path comment instead.
export const plainRegionComments = (code: string): string =>
	code.replace(/^\/\/#endregion\n/gm, "").replace(/^\/\/#region /gm, "// ");
