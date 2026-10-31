import {readMuted, writeMuted} from "./storage.ts";

// Sound effects, synthesized with Web Audio (no files)

type ToneOptions = {at?: number; to?: number; type?: OscillatorType; vol?: number; attack?: number};
type NoiseOptions = {at?: number; to?: number; filter?: BiquadFilterType; freq?: number; q?: number; vol?: number; attack?: number};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensure(): AudioContext | null {
	if (!ctx) {
		try {
			ctx = new (window.AudioContext || window.webkitAudioContext!)();
			master = ctx.createGain();
			master.gain.value = 0.55;
			const comp = ctx.createDynamicsCompressor();
			master.connect(comp);
			comp.connect(ctx.destination);
		} catch {
			ctx = null;
			return null;
		}
	}
	if (ctx.state === "suspended") ctx.resume().catch(() => {});
	return ctx;
}
const now = (): number => ctx!.currentTime;
function env(g: GainNode, t: number, vol: number, attack: number, dur: number): void {
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(vol, t + attack);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(freq: number, dur: number, o: ToneOptions = {}): void {
	const t = now() + (o.at || 0),
		osc = ctx!.createOscillator(),
		g = ctx!.createGain();
	osc.type = o.type || "sine";
	osc.frequency.setValueAtTime(freq, t);
	if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
	env(g, t, o.vol || 0.2, o.attack || 0.004, dur);
	osc.connect(g);
	g.connect(master!);
	osc.start(t);
	osc.stop(t + dur + 0.02);
}
let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, o: NoiseOptions = {}): void {
	if (!noiseBuf) {
		noiseBuf = ctx!.createBuffer(1, ctx!.sampleRate * 0.6, ctx!.sampleRate);
		const d = noiseBuf.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	}
	const t = now() + (o.at || 0),
		src = ctx!.createBufferSource(),
		f = ctx!.createBiquadFilter(),
		g = ctx!.createGain();
	src.buffer = noiseBuf;
	f.type = o.filter || "bandpass";
	f.Q.value = o.q || 1;
	f.frequency.setValueAtTime(o.freq || 800, t);
	if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
	env(g, t, o.vol || 0.2, o.attack || 0.003, dur);
	src.connect(f);
	f.connect(g);
	g.connect(master!);
	src.start(t);
	src.stop(t + dur + 0.02);
}
const jit = (v: number, p = 0.06): number => v * (1 + (Math.random() * 2 - 1) * p);
const SOUNDS = {
	roll: () => {
		noise(0.07, {freq: jit(520), q: 0.8, vol: 0.22});
		tone(jit(150), 0.09, {to: 90, type: "triangle", vol: 0.22});
	},
	wash: () => {
		noise(0.35, {filter: "highpass", freq: 600, to: 5000, vol: 0.16});
		[1568, 1319, 1047].forEach((f, i) => tone(f, 0.12, {vol: 0.05, at: 0.05 + i * 0.05}));
	},
	paint: () => {
		noise(0.18, {filter: "lowpass", freq: 2400, to: 350, vol: 0.22});
		tone(jit(420), 0.14, {to: 760, vol: 0.16, at: 0.02});
	},
	blocked: () => {
		tone(118, 0.11, {type: "square", vol: 0.06});
		tone(96, 0.13, {type: "square", vol: 0.06, at: 0.09});
	},
	gate: () => {
		tone(660, 0.18, {vol: 0.12});
		tone(990, 0.26, {vol: 0.1, at: 0.06});
	},
	wgate: () => {
		tone(880, 0.16, {type: "triangle", vol: 0.12});
		tone(1320, 0.3, {type: "triangle", vol: 0.08, at: 0.06});
	},
	solid: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, {type: "triangle", vol: 0.12, at: i * 0.06})),
	unsolid: () => {
		tone(520, 0.16, {to: 330, type: "triangle", vol: 0.1});
	},
	switch: () => {
		noise(0.03, {filter: "highpass", freq: 3000, vol: 0.25});
		tone(1250, 0.03, {type: "square", vol: 0.08});
		tone(820, 0.05, {type: "square", vol: 0.06, at: 0.05});
	},
	push: () => {
		noise(0.16, {filter: "lowpass", freq: 420, to: 200, vol: 0.35, attack: 0.01});
	},
	doorOpen: () => {
		tone(190, 0.32, {to: 520, type: "triangle", vol: 0.13});
		noise(0.28, {freq: 300, to: 1200, vol: 0.08});
	},
	doorShut: () => {
		tone(420, 0.22, {to: 150, type: "triangle", vol: 0.13});
		noise(0.08, {filter: "lowpass", freq: 300, vol: 0.25, at: 0.18});
	},
	undo: () => {
		tone(560, 0.08, {to: 330, vol: 0.1});
	},
	win: () => {
		[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, {type: "triangle", vol: 0.13, at: i * 0.09}));
		[523, 659, 784].forEach((f) => tone(f * 2, 0.9, {vol: 0.06, at: 0.4}));
		tone(1047, 0.9, {type: "triangle", vol: 0.1, at: 0.4});
	},
	tip: () => {
		tone(1047, 0.5, {vol: 0.08});
		tone(1568, 0.6, {vol: 0.05, at: 0.08});
	},
	hint: () => {
		tone(784, 0.18, {vol: 0.08});
		tone(1175, 0.24, {vol: 0.06, at: 0.07});
	},
	click: () => {
		tone(700, 0.04, {type: "triangle", vol: 0.06});
	},
	start: () => {
		[392, 523, 659, 784].forEach((f, i) => tone(f, 0.2, {type: "triangle", vol: 0.1, at: i * 0.05}));
	},
} satisfies Record<string, () => void>;

export const SFX = {
	play(name: keyof typeof SOUNDS): void {
		if (muted || !SOUNDS[name]) return;
		if (!ensure()) return;
		try {
			SOUNDS[name]();
		} catch {
			// A sound that fails to start never gets in the way of the game.
		}
	},
	ensure,
	get muted(): boolean {
		return muted;
	},
	setMuted(m: boolean): void {
		muted = m;
		writeMuted(m);
	},
};

function renderSoundBtns(): void {
	document.querySelectorAll(".soundbtn").forEach((b) => {
		b.setAttribute("aria-pressed", String(!SFX.muted));
		b.querySelector(".lbl")!.textContent = SFX.muted ? "Sound off" : "Sound on";
	});
}
function toggleSound(): void {
	SFX.setMuted(!SFX.muted);
	renderSoundBtns();
	if (!SFX.muted) SFX.play("click");
}

export function initSound(): void {
	muted = readMuted();
	// Browsers only allow audio after the viewer interacts, so wake it on the first press
	["pointerdown", "keydown"].forEach((ev) =>
		addEventListener(
			ev,
			() => {
				if (!SFX.muted) SFX.ensure();
			},
			{capture: true},
		),
	);
	document.querySelectorAll(".soundbtn").forEach((b) => b.addEventListener("click", toggleSound));
	addEventListener("keydown", (e) => {
		if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) toggleSound();
	});
	renderSoundBtns();
}
