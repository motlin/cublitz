// Makes the page an installable app that plays offline: the head gets the manifest and the tags Safari reads for a
// home screen app, and the service worker built from src/pwa/sw.ts is registered. The page outside the script has to
// stay the original's, so the tags are added here. The worker shares no code with the page, so the paths and the
// color are spelled out; tests/unit/pwa/manifest.test.ts checks them against src/pwa/manifest.ts.
export const HEAD_TAGS: [tag: string, attributes: Record<string, string>][] = [
	["link", {rel: "manifest", href: "/manifest.webmanifest"}],
	["meta", {name: "theme-color", content: "#161923"}],
	["meta", {name: "mobile-web-app-capable", content: "yes"}],
	["meta", {name: "apple-mobile-web-app-capable", content: "yes"}],
	["meta", {name: "apple-mobile-web-app-status-bar-style", content: "black-translucent"}],
	["meta", {name: "apple-mobile-web-app-title", content: "Cublitz"}],
	["link", {rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png"}],
];

export function initPwa(): void {
	HEAD_TAGS.forEach(([tag, attributes]) => {
		const el = document.createElement(tag);
		Object.entries(attributes).forEach(([name, value]) => {
			el.setAttribute(name, value);
		});
		document.head.appendChild(el);
	});
	// A host that forbids workers, such as a sandboxed frame, still gets the game.
	if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
