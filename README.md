# Cublitz

A rolling paint puzzle. You roll a cube over a board, picking up paint on whichever face touches the floor, and bring it to the target past gates, switches, boxes and doors. There are 30 campaign levels, an infinite mode and a level editor.

## `legacy/original.html`

The game began as one self-contained HTML file. `legacy/original.html` is that file, byte for byte (sha256 `a52a636cfe3705e3cc10d3bc6fe06f3b6a8b9b60fe3035d38f2e2181fd889fdb`). It is never edited: it is the reference every test compares against. `just check` fails if its hash changes.

## Layout

`src/core/` is the pure game in strict TypeScript: level data, the cube, the rules, the solver, the infinite generator, hint text and share codes. `src/ui/` is the page in strict imperative TypeScript: the DOM, input, animation, sound and storage. `src/styles/` holds the CSS, and `src/main.ts` starts everything.

The `src/ui/` modules call each other in cycles, because the game's flow is cyclic. That is safe because a module does nothing when imported: `src/main.ts` calls each `init` function in the original script's order, which also fixes the order listeners fire in. `tests/unit/ui/startup.test.ts` enforces this.

Localstorage values are read back as they are and not validated, because a hand-edited value has to behave as it always did. The types in `src/ui/storage.ts` describe what the game writes.

`index.html` is the original page with links in place of its two `<style>` elements and `src/main.ts` in place of its inline script. A small plugin in `vite.config.ts` writes `dist/` with the stylesheets back in their elements and the bundle as a classic inline script in the same spot, so `dist/` is one file that differs from the original only inside its `<script>` tag. Vite's own output would minify the CSS and defer it and the script to external files. The bundle has to stay a sloppy classic script like the original.

The original's top-level names are also the page's global scope, which anything using the console or a page script can see. `scripts/original-global-scope.ts` keeps that scope exactly: the build reads the names and kinds from `legacy/original.html`, leaves those global and moves every other helper into a private function. The build fails if the bundle lacks one of them.

`just dev` runs the modules directly, in strict mode, so a malformed saved value can behave differently there.

## The contract

Apart from the intentional divergences below, the shipped game must not change: rules, level data and order, solver results, generated levels, text, markup, CSS, animation timings, sounds, input, localStorage keys and formats (including the `cubist-*` names), share codes and font links. Only infrastructure may change. Any other bug in the game gets preserved and reported, not fixed.

## Intentional divergences

The shipped game differs from `legacy/original.html` in exactly these ways, which the owner approved:

- Skip canvas is disabled on the infinite win card
- The white gates tip says a paint remover takes paint off
- Level 23's tip says nothing on that level takes paint off
- Infinite levels shuffle the palette with the seeded generator, so a seed gives the same levels in every engine

`tests/support/intentional-divergences.ts` holds each one as an exact edit to the original's text. The harness applies those edits to an in-memory copy of the original and compares `dist/` against that copy, so any other difference still fails. A unit test checks the list above against that file.

## Commands

| Command              | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `just check`         | Formats, lints, type-checks and verifies the legacy artifact's hash |
| `just test`          | Runs the fast unit tests and golden checks                          |
| `just coverage`      | Runs the unit tests and reports coverage of `src/core/`             |
| `just test-browser`  | Builds, then runs the Playwright differential harness               |
| `just build`         | Writes `dist/`                                                      |
| `just golden`        | Regenerates `tests/golden/` from `legacy/original.html`             |
| `just prove-harness` | Confirms the harness fails on mutated throwaway copies of `dist/`   |
| `just deploy`        | Uploads `dist/` to the Cloudflare Pages project `cublitz`           |

Tool versions are pinned in `.mise/config.toml`.

The toolchain is synced from `~/projects/typescript-template` on Vite+. A few things differ from it on purpose. Node stays on the version `tests/golden/` was generated with. `vp fmt` skips `legacy/`, `index.html`, `src/styles/`, `src/core/levels.ts` and `tests/golden/`, because formatting them would change the shipped bytes. The `lint` block in `vite.config.ts` ends with overrides that turn off the rules the existing code breaks, with a count for each, and the Storybook overrides are gone because the project has no stories.

## How the safety net works

`tests/browser/` drives the same scripted session through the expected page (`legacy/original.html` with the intentional divergences applied) and the built `dist/`, side by side. After every step it compares normalized DOM, form values, focus, every element's position, the full computed style of key elements, all CSS rules, localStorage, status text, win state, text selection, history entries, and logs of Web Audio calls, timers and their cancels, scripted animations, history writes and pointer capture.

`tests/browser/harness/instruments.ts` makes that deterministic in both pages. It pins `Math.random` and `Date`, replaces `AudioContext` with a recorder, holds timers of a second or more and intervals until a script fires them, and holds back resize events the browser sends on its own. Google Fonts requests are answered with an empty stylesheet, so comparisons use fallback fonts; the links themselves are compared. The harness reads only what a player's browser exposes, so it keeps working when the script is split into modules.

`tests/golden/` holds `solve()` results for all 30 levels and generated infinite levels, produced by evaluating the original script. `tests/browser/smoke.spec.ts` checks those files against the original running in Chromium as well as in Node. The original's infinite generation relies on a sort with a random comparator, whose result depends on the JavaScript engine and how far it has optimized the sort: the same seed gives different levels on Node 24 and Node 26, and on one long-lived page. So `infinite.json` only holds on the pinned Node, and the unit tests have to run through `pnpm exec` or `just`, which use it.

`tests/golden/infinite-post-fix.json` holds the same seeds with the intentional divergences applied, which is what the shipped generator has to produce. `tests/browser/cross-engine.spec.ts` generates levels from one seed in Chromium, Firefox and WebKit and compares them, so `just test-browser` needs all three browsers. Changing the generator changes which levels a saved run continues on, while the saved run itself keeps working, because it stores a seed and a position and not the levels.

`just prove-harness` counts a mutant as caught only when a test fails on an assertion. A run where no test matched, the server did not start or the browser failed reports `INVALID` and fails the proof.

`tests/unit/core/` tests each rule directly and also runs the modules against the original script move by move, including malformed levels a share code could carry.
