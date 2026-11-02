import {expect, test} from "vite-plus/test";
import {buildVersion} from "../../../scripts/service-worker-build.ts";
import {PRECACHE_URLS} from "../../../src/pwa/manifest.ts";
import {cacheName, dropStaleCaches, precache, respond, staleCaches} from "../../../src/pwa/worker.ts";

const ORIGIN = "https://cublitz.example";

const urlOf = (request: RequestInfo | URL): string =>
	new URL(request instanceof Request ? request.url : String(request), ORIGIN).href;

// Just enough of CacheStorage for the worker: one Map of URL to body text per named cache.
class FakeCaches
{
	readonly stores = new Map<string, Map<string, string>>();
	readonly reloads: string[] = [];

	async open(name: string): Promise<Cache>
	{
		const store = this.stores.get(name) ?? new Map<string, string>();
		this.stores.set(name, store);
		return Promise.resolve(
			{
				addAll: async (requests: RequestInfo[]) =>
				{
					for (const request of requests)
					{
						this.reloads.push(request instanceof Request ? request.cache : "default");
						store.set(urlOf(request), `body of ${new URL(urlOf(request)).pathname}`);
					}
					return Promise.resolve();
				},
				match: async (request: RequestInfo | URL) =>
				{
					const body = store.get(urlOf(request));
					return Promise.resolve(body === undefined ? undefined : new Response(body));
				},
			} as unknown as Cache,
		);
	}

	async keys(): Promise<string[]>
	{
		return Promise.resolve([...this.stores.keys()]);
	}

	async delete(name: string): Promise<boolean>
	{
		return Promise.resolve(this.stores.delete(name));
	}
}

const offline = async (): Promise<Response> => Promise.reject(new TypeError("Failed to fetch"));
const online = async (request: Request): Promise<Response> =>
	Promise.resolve(new Response(`network ${new URL(request.url).pathname}${new URL(request.url).search}`));
const navigation = (path: string): Request =>
{
	const request = new Request(ORIGIN + path);
	Object.defineProperty(
		request,
		"mode",
		{
			value: "navigate",
		},
	);
	return request;
};
const text = async (response: Response | undefined): Promise<string | undefined> => response?.text();

test("the version comes from the built files, so any change to them makes a new cache", () =>
{
	const page = "<!doctype html><title>Cublitz</title>";
	const icon = new Uint8Array([137, 80, 78, 71]);
	const version = buildVersion([page, icon]);
	expect(version).toMatch(/^[0-9a-f]{16}$/);
	expect(buildVersion([page, icon])).toBe(version);
	expect(buildVersion([`${page} `, icon])).not.toBe(version);
	expect(buildVersion([page, new Uint8Array([137, 80, 78, 72])])).not.toBe(version);
	expect(buildVersion([icon, page])).not.toBe(version);
	expect(cacheName(version)).toBe(`cublitz-${version}`);
});

test("only the game's caches from other versions are stale", () =>
{
	expect(staleCaches(["cublitz-aaa", "cublitz-bbb", "someone-else", "cublitz-ccc"], "bbb")).toStrictEqual([
		"cublitz-aaa",
		"cublitz-ccc",
	]);
});

test("installing fetches every precached file past the HTTP cache into this version's cache", async () =>
{
	const caches = new FakeCaches();
	await precache(caches as unknown as CacheStorage, ORIGIN, "v2");
	expect([...caches.stores.keys()]).toStrictEqual(["cublitz-v2"]);
	expect([...caches.stores.get("cublitz-v2")!.keys()]).toStrictEqual(PRECACHE_URLS.map((url) => ORIGIN + url));
	expect(caches.reloads).toStrictEqual(PRECACHE_URLS.map(() => "reload"));
});

test("activating deletes the caches of older versions", async () =>
{
	const caches = new FakeCaches();
	await caches.open("cublitz-v1");
	await caches.open("cublitz-v2");
	await caches.open("other-app");
	await dropStaleCaches(caches as unknown as CacheStorage, "v2");
	expect([...caches.stores.keys()]).toStrictEqual(["cublitz-v2", "other-app"]);
});

test("a launch online gets the page from the network, so a new deploy shows at once", async () =>
{
	const caches = new FakeCaches();
	await precache(caches as unknown as CacheStorage, ORIGIN, "v1");
	const response = respond(navigation("/?CUBLITZ:abc"), ORIGIN, caches as unknown as CacheStorage, "v1", online);
	expect(await text(await response)).toBe("network /?CUBLITZ:abc");
});

test("a launch offline gets the cached page for any address in scope, shared links included", async () =>
{
	const caches = new FakeCaches();
	await precache(caches as unknown as CacheStorage, ORIGIN, "v1");
	const bodies = await Promise.all(
		["/", "/?CUBLITZ:abc", "/index.html"].map(async (path) =>
			text(await respond(navigation(path), ORIGIN, caches as unknown as CacheStorage, "v1", offline)),
		),
	);
	expect(bodies).toStrictEqual(["body of /", "body of /", "body of /"]);
});

test("a launch offline with nothing cached fails as the network did", async () =>
{
	const caches = new FakeCaches();
	await expect(respond(navigation("/"), ORIGIN, caches as unknown as CacheStorage, "v1", offline)!).rejects.toThrow(
		"Failed to fetch",
	);
});

test("precached files come from the cache, and anything else goes to the network", async () =>
{
	const caches = new FakeCaches();
	await precache(caches as unknown as CacheStorage, ORIGIN, "v1");
	const icon = respond(
		new Request(`${ORIGIN}/icons/icon-192.png`),
		ORIGIN,
		caches as unknown as CacheStorage,
		"v1",
		offline,
	);
	expect(await text(await icon)).toBe("body of /icons/icon-192.png");
	const other = respond(new Request(`${ORIGIN}/robots.txt`), ORIGIN, caches as unknown as CacheStorage, "v1", online);
	expect(await text(await other)).toBe("network /robots.txt");
});

test("the worker leaves other origins and other methods to the browser", () =>
{
	const caches = new FakeCaches() as unknown as CacheStorage;
	expect(
		respond(new Request("https://fonts.googleapis.com/css2?family=Outfit"), ORIGIN, caches, "v1", online),
	).toBeUndefined();
	expect(
		respond(
			new Request(
				`${ORIGIN}/`,
				{
					method: "POST",
				},
			),
			ORIGIN,
			caches,
			"v1",
			online,
		),
	).toBeUndefined();
});
