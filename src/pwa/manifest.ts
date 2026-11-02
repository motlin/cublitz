// What makes the page an installable app: the web app manifest and the files the service worker keeps for offline
// play. src/ui/pwa.ts links them from the page and stays apart, so the page and the worker share no code. The colors
// are the game's --ground, so the splash screen and status bar match the page.
const GROUND = "#161923";

type Icon = {src: string; sizes: string; type: "image/png"; purpose: "any" | "maskable"};

export const MANIFEST = {
	id: "/",
	name: "Cublitz",
	short_name: "Cublitz",
	description: "A rolling paint puzzle",
	start_url: "/",
	scope: "/",
	display: "standalone",
	orientation: "any",
	background_color: GROUND,
	theme_color: GROUND,
	icons: [
		{src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any"},
		{src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any"},
		{src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable"},
	] satisfies Icon[],
};

export const APPLE_TOUCH_ICON = "/icons/apple-touch-icon.png";

export const PRECACHE_URLS = ["/", "/manifest.webmanifest", ...MANIFEST.icons.map(({src}) => src), APPLE_TOUCH_ICON];
