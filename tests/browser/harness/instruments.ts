// Runs inside both pages, before any game code. Nothing here may depend on how the game is built:
// the harness only sees the DOM, the browser APIs the game calls and localStorage, so it keeps
// working when the single script is later split into modules.

export type InstrumentOptions = {
	randomSeed: number;
	now: number;
	hot: {data?: unknown; useReady?: boolean} | null;
};

export type Sections = Record<string, unknown>;

export type Snapshot = {
	hashes: Record<string, number>;
	location: string;
	storage: Record<string, string>;
	status: {text: string; html: string; warn: boolean};
	win: {hidden: boolean; title: string; score: string; note: string; nextHidden: boolean; retryHidden: boolean};
	hud: {name: string; num: string; moves: string; par: string};
	hint: {hidden: boolean; step: string; text: string};
	solution: {hidden: boolean; text: string};
	tip: {hidden: boolean; title: string; count: string};
	audio: unknown[];
	timers: unknown[];
	animations: unknown[];
	prevented: string[];
	focusCalls: unknown[];
	historyCalls: unknown[];
	history: {length: number; state: unknown};
	pointerCaptures: unknown[];
	errors: string[];
};

type Harness = {
	settled: () => Promise<void>;
	fireParked: () => void;
	tickIntervals: (count: number) => void;
	capture: () => Snapshot;
	full: () => Sections;
	audioCount: () => number;
};

declare global {
	interface Window {
		__harness: Harness;
	}
}

export function installInstruments(options: InstrumentOptions): void {
	const audio: unknown[] = [];
	const timers: unknown[] = [];
	const animations: unknown[] = [];
	const errors: string[] = [];
	const prevented: string[] = [];
	const focusCalls: unknown[] = [];
	const historyCalls: unknown[] = [];
	const pointerCaptures: unknown[] = [];
	let audioTotal = 0;

	// ---- Math.random and Date are pinned ----
	let a = options.randomSeed;
	Math.random = () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const RealDate = Date;
	const pinned = options.now;
	class PinnedDate extends RealDate {
		constructor(...args: unknown[]) {
			if (args.length === 0) super(pinned);
			else super(...(args as [number]));
		}
		static override now(): number {
			return pinned;
		}
	}
	window.Date = PinnedDate as DateConstructor;

	// ---- Timers: short ones run for real and hold back "settled"; long ones and intervals only
	// fire when a script asks, so what the page shows never depends on how fast the machine is ----
	const LONG_TIMER_MS = 1000;
	const realSetTimeout = window.setTimeout.bind(window);
	const realClearTimeout = window.clearTimeout.bind(window);
	const realRaf = window.requestAnimationFrame.bind(window);
	const realCaf = window.cancelAnimationFrame.bind(window);
	const shortTimers = new Map<number, number>();
	const parked = new Map<number, {run: () => void; delay: number}>();
	const intervals = new Map<number, () => void>();
	const frames = new Set<number>();
	let nextVirtualId = 1_000_000_000;

	window.setTimeout = ((handler: () => void, delay = 0, ...args: unknown[]) => {
		timers.push(["timeout", delay]);
		const run = () => (handler as (...a: unknown[]) => void)(...args);
		if (delay >= LONG_TIMER_MS) {
			const id = nextVirtualId++;
			parked.set(id, {run, delay});
			return id;
		}
		const id: number = realSetTimeout(() => {
			try {
				run();
			} finally {
				shortTimers.delete(id);
			}
		}, delay);
		shortTimers.set(id, delay);
		return id;
	}) as typeof window.setTimeout;
	window.clearTimeout = ((id: number) => {
		// Only a cancel that stops a pending timer is recorded. Clearing one that already fired changes nothing.
		const pending = parked.get(id)?.delay ?? shortTimers.get(id);
		if (pending !== undefined) timers.push(["clearTimeout", pending]);
		if (parked.delete(id)) return;
		shortTimers.delete(id);
		realClearTimeout(id);
	}) as typeof window.clearTimeout;
	window.setInterval = ((handler: () => void, delay = 0) => {
		timers.push(["interval", delay]);
		const id = nextVirtualId++;
		intervals.set(id, handler);
		return id;
	}) as typeof window.setInterval;
	window.clearInterval = ((id: number) => {
		if (intervals.delete(id)) timers.push(["clearInterval"]);
	}) as typeof window.clearInterval;
	window.requestAnimationFrame = (callback) => {
		const id: number = realRaf((time) => {
			try {
				callback(time);
			} finally {
				frames.delete(id);
			}
		});
		frames.add(id);
		return id;
	};
	window.cancelAnimationFrame = (id) => {
		frames.delete(id);
		realCaf(id);
	};

	// ---- WAAPI: every scripted animation's keyframes and timing are compared ----
	const realAnimate = Element.prototype.animate;
	Element.prototype.animate = function (keyframes, timing) {
		const target = this.className || this.tagName;
		animations.push([target, this instanceof HTMLElement ? this.style.transformOrigin : "", keyframes, timing]);
		return realAnimate.call(this, keyframes, timing);
	};

	// ---- Whether the game swallowed an event and how it moved focus, neither of which always shows ----
	const realPreventDefault = Event.prototype.preventDefault;
	Event.prototype.preventDefault = function () {
		prevented.push(`${this.type}${this instanceof KeyboardEvent ? ` ${this.key}` : ""}`);
		realPreventDefault.call(this);
	};
	const realFocus = HTMLElement.prototype.focus;
	HTMLElement.prototype.focus = function (focusOptions) {
		focusCalls.push([this.id, focusOptions ?? null]);
		realFocus.call(this, focusOptions);
	};

	// ---- Which way the page writes history and whether a drag holds on to its pointer. Neither shows in the DOM ----
	for (const method of ["pushState", "replaceState"] as const) {
		const real = History.prototype[method];
		History.prototype[method] = function (state, unused, url) {
			// The two pages live at different paths, which the game passes back as its own URL.
			historyCalls.push([method, state, unused, url === location.pathname ? "<path>" : (url ?? null)]);
			real.call(this, state, unused, url);
		};
	}
	const capturing = (el: Element): string => el.id || el.tagName;
	const realSetCapture = Element.prototype.setPointerCapture;
	Element.prototype.setPointerCapture = function (pointerId) {
		pointerCaptures.push(["set", capturing(this)]);
		realSetCapture.call(this, pointerId);
	};
	const realReleaseCapture = Element.prototype.releasePointerCapture;
	Element.prototype.releasePointerCapture = function (pointerId) {
		pointerCaptures.push(["release", capturing(this)]);
		realReleaseCapture.call(this, pointerId);
	};

	// ---- Web Audio: a recording stand-in, so every call sequence and argument is compared and
	// currentTime does not depend on the wall clock ----
	const record = (...entry: unknown[]) => {
		audioTotal++;
		audio.push(entry);
	};
	let nodeCount = 0;
	const param = (owner: string, name: string) => ({
		set value(v: number) {
			record(`${owner}.${name}=`, v);
		},
		setValueAtTime: (...args: number[]) => record(`${owner}.${name}.setValueAtTime`, ...args),
		exponentialRampToValueAtTime: (...args: number[]) => record(`${owner}.${name}.exponentialRampToValueAtTime`, ...args),
	});
	const node = (kind: string, params: string[]) => {
		const id = `${kind}#${nodeCount++}`;
		record("create", id);
		const self: Record<string, unknown> = {
			__id: id,
			connect: (other: {__id: string}) => record(`${id}.connect`, other.__id),
			start: (t: number) => record(`${id}.start`, t),
			stop: (t: number) => record(`${id}.stop`, t),
		};
		for (const p of params) self[p] = param(id, p);
		return self;
	};
	class RecordingAudioContext {
		currentTime = 0;
		sampleRate = 48000;
		state = "suspended";
		destination = {__id: "destination"};
		constructor() {
			record("new AudioContext");
		}
		resume() {
			record("resume");
			this.state = "running";
			return Promise.resolve();
		}
		createGain() {
			return node("gain", ["gain"]);
		}
		createDynamicsCompressor() {
			return node("compressor", []);
		}
		createOscillator() {
			const osc = node("osc", ["frequency"]);
			Object.defineProperty(osc, "type", {set: (v: string) => record(`${String(osc["__id"])}.type=`, v)});
			return osc;
		}
		createBiquadFilter() {
			const f = node("filter", ["frequency", "Q"]);
			Object.defineProperty(f, "type", {set: (v: string) => record(`${String(f["__id"])}.type=`, v)});
			return f;
		}
		createBufferSource() {
			const s = node("source", []);
			Object.defineProperty(s, "buffer", {
				set: (b: {__data: Float32Array}) => record(`${String(s["__id"])}.buffer`, hash(b.__data.join())),
			});
			return s;
		}
		createBuffer(channels: number, length: number, rate: number) {
			record("createBuffer", channels, length, rate);
			const data = new Float32Array(length);
			return {__data: data, getChannelData: () => data};
		}
	}
	(window as unknown as {AudioContext: unknown}).AudioContext = RecordingAudioContext;
	window.webkitAudioContext = RecordingAudioContext as unknown as typeof AudioContext;

	// The browser delivers resize events at moments that differ between pages, for example around
	// mobile emulation and full-page screenshots. Only the events a script dispatches reach the game.
	window.addEventListener("resize", (e) => {
		if (e.isTrusted) e.stopImmediatePropagation();
	});

	window.addEventListener("error", (e) => errors.push(`error: ${e.message}`));
	window.addEventListener("unhandledrejection", (e) => errors.push(`rejection: ${String(e.reason)}`));

	if (options.hot) {
		const {data, useReady} = options.hot;
		const hot: Record<string, unknown> = {
			data,
			snapshot: (fn: () => unknown) => {
				record("hot.snapshot", typeof fn);
				(window as unknown as {__hotSnapshot: unknown}).__hotSnapshot = fn;
			},
		};
		if (useReady) hot["ready"] = (start: (d: unknown) => void) => start(data);
		window.claude = {hot} as never;
	}

	// ---- Reading the page ----
	const hash = (text: string): number => {
		let h1 = 0xdeadbeef;
		let h2 = 0x41c6ce57;
		for (let i = 0; i < text.length; i++) {
			const c = text.charCodeAt(i);
			h1 = Math.imul(h1 ^ c, 2654435761);
			h2 = Math.imul(h2 ^ c, 1597334677);
		}
		h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
		h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
		return 4294967296 * (2097151 & h2) + (h1 >>> 0);
	};

	// The script's bytes differ by design, and the smoke tests compare everything around it byte for byte. Style
	// elements stay in the comparison, so that one added at runtime shows. So do the Google Fonts links.
	const isPlumbing = (el: Element): boolean => {
		const tag = el.tagName;
		if (tag === "SCRIPT") return true;
		if (tag !== "LINK") return false;
		const href = el.getAttribute("href") ?? "";
		return !/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(href);
	};
	const serialize = (n: Node, parentIsRoot: boolean): string => {
		if (n.nodeType === Node.TEXT_NODE) {
			const text = n.nodeValue ?? "";
			return parentIsRoot && !text.trim() ? "" : text;
		}
		if (n.nodeType !== Node.ELEMENT_NODE) return "";
		const el = n as Element;
		if (isPlumbing(el)) return "";
		const attrs = [...el.attributes]
			.map((at) => `${at.name}=${JSON.stringify(at.value)}`)
			.sort()
			.join(" ");
		const rootLike = el.tagName === "BODY" || el.tagName === "HEAD" || el.tagName === "HTML";
		const kids = [...el.childNodes].map((k) => serialize(k, rootLike)).join("");
		return `<${el.tagName.toLowerCase()} ${attrs}>${kids}</>`;
	};
	const describe = (el: Element | null): string => {
		if (!el) return "none";
		return `${el.tagName}#${el.id}.${el.className}:${(el.textContent ?? "").slice(0, 40)}`;
	};
	const KEY_ELEMENTS = [
		"html", "body", ".app", "#topbar", ".brand", ".brand h1", ".brand .tag", ".hdr-right", "#levels", ".lvbtn",
		".lvbtn.cur", ".lvbtn.done", ".lvbtn.locked", "#modePlay", ".soundbtn", "#palBtn", "#palette", "#palSwatches",
		"#titleView", ".title-name", ".title-name span", "#titlePlay", "#titleInf", "#titleProgress", "#tcube", ".tf-t",
		"#playView", "#stage", "#lvName", "#lvNum", "#lvTip", "#status", "#viewport", "#board", ".tile", ".tile.paint",
		".tile.gate", ".tile.goal", ".tile.door", ".tile.switch", ".tile.button", ".tile.wgate", ".tile.wash", ".cube",
		".roller", ".face.f-t", ".face.f-b", ".shadow", ".crate", ".door-block", "#dpad", "#dpad button", "#net", ".nf",
		"#needBox", "#moves", "#par", "#undoBtn", "#resetBtn", "#hintBtn", "#solBtn", "#hintBox", "#solBox", ".ov-sol",
		".ov-ring", ".ov-trail", "#tip", "#tip .card", "#tipTitle", "#win", "#win .card", "#winTitle", "#infCard",
		"#infRank", "#editView", "#edTools button", "#edColors button", "#edGrid", "#edGrid .ec", "#edResult", "#edCode",
		"#edList",
	];
	const computedOf = (el: Element): Record<string, string> => {
		const cs = getComputedStyle(el);
		// Sorted because the browser lists custom properties in an order that varies between pages.
		const names = Array.from({length: cs.length}, (_, i) => cs.item(i)).sort();
		return Object.fromEntries(names.map((name) => [name, cs.getPropertyValue(name)]));
	};
	const cssom = (): string[] => {
		const rules: string[] = [];
		for (const sheet of document.styleSheets) {
			try {
				for (const rule of sheet.cssRules) rules.push(rule.cssText);
			} catch {
				rules.push("inaccessible sheet");
			}
		}
		return rules;
	};
	const freezeInfinite = () => {
		for (const anim of document.getAnimations()) {
			if (anim.effect?.getComputedTiming().iterations !== Infinity) continue;
			anim.pause();
			anim.currentTime = 0;
		}
	};
	const sectionsNow = (): Sections => {
		freezeInfinite();
		const computed: Record<string, unknown> = {};
		const rects: Record<string, unknown> = {};
		for (const selector of KEY_ELEMENTS) {
			const el = document.querySelector(selector);
			computed[selector] = el ? computedOf(el) : null;
		}
		document.querySelectorAll("body *").forEach((el, i) => {
			if (isPlumbing(el)) return;
			const r = el.getBoundingClientRect();
			rects[`${i}:${el.tagName}#${el.id}.${el.className}`] = [r.x, r.y, r.width, r.height];
		});
		const fields = [...document.querySelectorAll<HTMLInputElement>("input, select, textarea")].map((el) => [
			el.id, el.value, el.checked, el.disabled, el.selectionStart, el.selectionEnd,
		]);
		return {
			dom: serialize(document.documentElement, true).split("><").join(">\n<"),
			computed,
			rects,
			cssom: cssom(),
			fields,
			selection: String(window.getSelection()),
			focus: describe(document.activeElement),
			scroll: [window.scrollX, window.scrollY, document.documentElement.scrollWidth, document.documentElement.scrollHeight],
			viewportVars: document.documentElement.getAttribute("style") ?? "",
		};
	};
	const textOf = (id: string): string => document.getElementById(id)?.textContent ?? "";
	const hiddenOf = (id: string): boolean => document.getElementById(id)?.hidden !== false;
	const drain = (list: unknown[]): unknown[] => list.splice(0, list.length);
	let lastSections: Sections = {};

	window.__harness = {
		settled: () =>
			new Promise<void>((resolve) => {
				let quiet = 0;
				const check = () => {
					const running = document.getAnimations().some((anim) => {
						const finite = anim.effect?.getComputedTiming().iterations !== Infinity;
						return finite && (anim.pending || anim.playState === "running");
					});
					quiet = running || shortTimers.size > 0 || frames.size > 0 ? 0 : quiet + 1;
					if (quiet >= 3) resolve();
					else realRaf(() => realSetTimeout(check, 0));
				};
				check();
			}),
		fireParked: () => {
			const pending = [...parked.values()];
			parked.clear();
			pending.forEach(({run}) => run());
		},
		tickIntervals: (count) => {
			for (let i = 0; i < count; i++) [...intervals.values()].forEach((run) => run());
		},
		full: () => lastSections,
		audioCount: () => audioTotal,
		capture: () => {
			const hashes: Record<string, number> = {};
			lastSections = sectionsNow();
			for (const [key, value] of Object.entries(lastSections)) hashes[key] = hash(JSON.stringify(value));
			const storage: Record<string, string> = {};
			for (const key of Object.keys(localStorage).sort()) storage[key] = localStorage.getItem(key) ?? "";
			const status = document.getElementById("status");
			return {
				hashes,
				location: location.hash,
				storage,
				status: {text: status?.textContent ?? "", html: status?.innerHTML ?? "", warn: status?.classList.contains("warn") ?? false},
				win: {
					hidden: hiddenOf("win"),
					title: textOf("winTitle"),
					score: textOf("winScore"),
					note: textOf("winNote"),
					nextHidden: hiddenOf("winNext"),
					retryHidden: hiddenOf("winRetry"),
				},
				hud: {name: textOf("lvName"), num: textOf("lvNum"), moves: textOf("moves"), par: textOf("par")},
				hint: {hidden: hiddenOf("hintBox"), step: textOf("hintStep"), text: textOf("hintText")},
				solution: {hidden: hiddenOf("solBox"), text: textOf("solText")},
				tip: {hidden: hiddenOf("tip"), title: textOf("tipTitle"), count: textOf("tipCount")},
				audio: drain(audio),
				timers: drain(timers),
				animations: drain(animations),
				prevented: drain(prevented) as string[],
				focusCalls: drain(focusCalls),
				historyCalls: drain(historyCalls),
				history: {length: history.length, state: history.state},
				pointerCaptures: drain(pointerCaptures),
				errors: errors.slice(),
			};
		},
	};
}
