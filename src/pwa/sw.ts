import {dropStaleCaches, precache, respond} from "./worker.ts";

// The service worker, built to dist/sw.js by scripts/service-worker-build.ts, which puts the build's version in place
// of the placeholder. A new deploy changes that version, so the browser installs the new worker on the next launch.
// It takes over at once and deletes the old build's cache, so no player is left on an old version.
const VERSION = "__CUBLITZ_SW_VERSION__";

// The project's lib is the page's, so the few worker types this needs are spelled out here.
type ExtendableEvent = Event & {waitUntil: (promise: Promise<unknown>) => void};
type FetchEvent = ExtendableEvent & {request: Request; respondWith: (response: Promise<Response>) => void};
type WorkerScope = {
	location: Location;
	skipWaiting: () => Promise<void>;
	clients: {claim: () => Promise<void>};
	addEventListener: ((type: "install" | "activate", listener: (event: ExtendableEvent) => void) => void) &
		((type: "fetch", listener: (event: FetchEvent) => void) => void);
};
const worker = self as unknown as WorkerScope;

worker.addEventListener("install", (event) => {
	event.waitUntil(precache(caches, worker.location.origin, VERSION).then(async () => worker.skipWaiting()));
});

worker.addEventListener("activate", (event) => {
	event.waitUntil(dropStaleCaches(caches, VERSION).then(async () => worker.clients.claim()));
});

worker.addEventListener("fetch", (event) => {
	const response = respond(event.request, worker.location.origin, caches, VERSION, async (request) => fetch(request));
	if (response) event.respondWith(response);
});
