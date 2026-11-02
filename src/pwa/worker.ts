import {PRECACHE_URLS} from "./manifest.ts";

// The service worker's logic, apart from the worker global so that tests can hand it fake caches and a fake network.
const PREFIX = "cublitz-";

export const cacheName = (version: string): string => PREFIX + version;

/** Every cache this game made for another build. Caches of other apps on the origin are left alone. */
export const staleCaches = (names: string[], version: string): string[] =>
	names.filter((name) => name.startsWith(PREFIX) && name !== cacheName(version));

/** Fetches every file the game needs past the HTTP cache, so a new build never stores an old file. */
export async function precache(caches: CacheStorage, origin: string, version: string): Promise<void> {
	const cache = await caches.open(cacheName(version));
	await cache.addAll(PRECACHE_URLS.map((url) => new Request(new URL(url, origin), {cache: "reload"})));
}

export async function dropStaleCaches(caches: CacheStorage, version: string): Promise<void> {
	await Promise.all(staleCaches(await caches.keys(), version).map(async (name) => caches.delete(name)));
}

/**
 * The response for a request the page makes, or undefined to leave it to the browser. A page load tries the network
 * first, so a new deploy shows on the next launch, and falls back to the cached page for any address in scope, which
 * keeps shared ?CUBLITZ: links working offline. Precached files come from the cache.
 */
export function respond(
	request: Request,
	origin: string,
	caches: CacheStorage,
	version: string,
	fetcher: (request: Request) => Promise<Response>,
): Promise<Response> | undefined {
	const url = new URL(request.url);
	if (request.method !== "GET" || url.origin !== origin) return undefined;
	const cached = async (path: string): Promise<Response | undefined> =>
		(await caches.open(cacheName(version))).match(path);
	if (request.mode === "navigate")
		return (async () => {
			try {
				return await fetcher(request);
			} catch (error) {
				const page = await cached("/");
				if (page) return page;
				throw error;
			}
		})();
	if (url.search === "" && PRECACHE_URLS.includes(url.pathname))
		return (async () => (await cached(url.pathname)) ?? fetcher(request))();
	return fetcher(request);
}
