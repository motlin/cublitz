# Cublitz

A rolling paint puzzle. You roll a cube over a board, picking up paint on whichever face touches the
floor, and bring it to the target past gates, switches, boxes and doors. There are 30 campaign levels,
an infinite mode and a level editor.

## `legacy/original.html`

The game began as one self-contained HTML file. `legacy/original.html` is that file, byte for byte
(sha256 `a52a636cfe3705e3cc10d3bc6fe06f3b6a8b9b60fe3035d38f2e2181fd889fdb`). It is never edited: it is
the reference every test compares against. `just check` fails if its hash changes.

`index.html` is currently an identical copy, so `dist/` ships the original game unchanged. Vite would
minify the inline CSS, so a small plugin in `vite.config.ts` writes the raw page to the output.

## The contract

The shipped game must not change: rules, level data and order, solver results, generated levels,
text, markup, CSS, animation timings, sounds, input, localStorage keys and formats (including the
`cubist-*` names), share codes and font links. Only infrastructure may change. A bug in the game gets
preserved and reported, not fixed.

## Commands

| Command               | What it does                                                        |
| --------------------- | ------------------------------------------------------------------- |
| `just check`          | Type-checks and verifies the legacy artifact's hash                 |
| `just test`           | Runs the fast unit tests and golden checks                          |
| `just test-browser`   | Builds, then runs the Playwright differential harness               |
| `just build`          | Writes `dist/`                                                      |
| `just golden`         | Regenerates `tests/golden/` from `legacy/original.html`             |
| `just prove-harness`  | Confirms the harness fails on mutated throwaway copies of `dist/`   |
| `just deploy`         | Uploads `dist/` to the Cloudflare Pages project `cublitz`           |

Tool versions are pinned in `.mise/config.toml`.

## How the safety net works

`tests/browser/` drives the same scripted session through `legacy/original.html` and the built
`dist/`, side by side. After every step it compares normalized DOM, form values, focus, every
element's position, the full computed style of key elements, all CSS rules, localStorage, status
text, win state, and logs of Web Audio calls, timers and scripted animations.

`tests/browser/harness/instruments.ts` makes that deterministic in both pages. It pins `Math.random`
and `Date`, replaces `AudioContext` with a recorder, holds timers of a second or more and intervals
until a script fires them, and holds back resize events the browser sends on its own. Google Fonts
requests are answered with an empty stylesheet, so comparisons use fallback fonts; the links
themselves are compared. The harness reads only what a player's browser exposes, so it keeps working
when the script is split into modules.

`tests/golden/` holds `solve()` results for all 30 levels and generated infinite levels, produced by
evaluating the original script. `tests/browser/smoke.spec.ts` checks those files against the original
running in Chromium as well as in Node, since infinite generation relies on a sort with a random
comparator, whose result depends on the JavaScript engine.
