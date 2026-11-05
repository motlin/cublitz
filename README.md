# Cublitz

A rolling paint puzzle. You roll a cube over a board, picking up paint on whichever face touches the floor, and bring it to the target past gates, switches, boxes and doors. There are 31 campaign levels, an infinite mode and a level editor.

## Layout

`src/core/` is the pure game in strict TypeScript: level data, the cube, the rules, the solver, the infinite generator, hint text and share codes. `src/ui/` is the page in strict imperative TypeScript: the DOM, input, animation, sound and storage. `src/styles/` holds the CSS, and `src/main.ts` starts everything.

The `src/ui/` modules call each other in cycles, because the game's flow is cyclic. That is safe because a module does nothing when imported: `src/main.ts` calls each `init` function in a fixed order, which also fixes the order listeners fire in. `tests/unit/ui/startup.test.ts` enforces this.

Localstorage values are read back as they are and not validated, because a hand-edited value has to behave as it always did. The types in `src/ui/storage.ts` describe what the game writes.

`index.html` links its two stylesheets and `src/main.ts`. A small plugin in `vite.config.ts` writes `dist/` with the stylesheets inlined as `<style>` elements and the bundle as a classic inline script in the same spot, so `dist/index.html` is one file. Beside it ship only the files that make it an installable app, described below. Vite's own output would minify the CSS and defer it and the script to external files. The bundle stays a sloppy classic script, so its top-level names are page globals, which the browser tests use to drive the game.

`just dev` runs the modules directly, in strict mode, so a malformed saved value can behave differently there.

## The phone layout

A touch screen no larger than a phone, meaning `(pointer: coarse)` and at most 932px wide or 500px tall, gets its own layout and gestures from `src/ui/touch.ts`. Nothing of it runs or exists anywhere else: the stylesheet `src/styles/touch.css` is added by the script only once that query matches, and a large touch screen behaves as it always did.

Play is one fixed screen that never scrolls. The board fills what the top bar and the dock leave, sized by `fitBoard` in `src/ui/touch-geometry.ts` so that the whole level shows. The level list and other header controls open as a sheet from the menu button. One moving finger on the board is a swipe, resolved on lift to the nearest grid axis as drawn. Two fingers that land together, or that both move, zoom and pan even if one of them is off the board, and a finger that has been down and still is ignored, as `src/ui/gestures.ts` lays out. So a pinch whose first finger stays down for a moment before the second lands, and which then moves only the second, reads as a swipe. On the editor's grid one finger paints and two zoom and pan. Undo, Restart and Hint stay in a row that never scrolls, and the other actions open above it from the More button. The page itself never zooms on these screens, wherever a pinch lands, because fixed play has no gesture that could bring a zoomed page back; a pinch with no finger on the board or the grid does nothing.

Browser tests that pass `mobile` to the session harness are told that query does not match, so they exercise the desktop layout under touch emulation. `tests/browser/touch.spec.ts` covers the layout itself with real touch input. WebKit there shows only layout and the finger logic, and emulation says nothing about how a real iPhone handles its own gestures.

## Installing as an app

The game installs from the browser as a standalone app and plays offline: campaign, merge levels, editor and shared `?CUBLITZ:` links. `src/ui/pwa.ts` adds the manifest link, `theme-color` and Safari's `apple-*` tags to the head and registers `/sw.js`. `src/pwa/manifest.ts` holds the manifest and the files the worker keeps, and `src/pwa/worker.ts` its logic.

`scripts/service-worker-build.ts` builds `src/pwa/sw.ts` to `dist/sw.js` and writes `dist/manifest.webmanifest`. It versions the worker's cache with a hash of the built page, the manifest and the icons, so each deploy that changes them is a new worker. A launch loads the page from the network when it can and from the cache when it cannot, the new worker takes over at once, and it deletes the old build's cache, so nobody has to clear anything after a deploy. `public/_headers` stops Cloudflare caching `sw.js` and the manifest, and gives the manifest its type. The icons in `public/icons/` are rendered from `scripts/icons/*.svg` by `just icons`.

`tests/browser/pwa.spec.ts` checks that Chromium reads the manifest without errors and finds the page installable, that the worker takes control, that a reload offline still plays, that a new deploy shows on the next launch, and that the phone layout stays inside emulated safe-area insets. None of that proves an iPhone home screen install: whether Safari picks up the tags added by the script, the icon it shows, how standalone mode draws the status bar over the page, and how iOS evicts the worker's cache all need a real device. The Google Fonts files are not cached by the worker, so offline the game falls back to its system fonts unless the browser's own cache still holds them.

## Link previews

`index.html` carries Open Graph and Twitter card tags in its head, because the crawlers that build link previews read the page as served and run no script. They point at `https://cublitz.motlin.com/og.png`, a 1200×630 image that `scripts/og-image.ts` screenshots from the built title screen, with its cube stopped at one angle and its buttons hidden. `tests/unit/page/social-card.test.ts` checks the tags and the image's size.

## Merge levels

`src/core/merge-levels.ts` holds levels beyond the campaign. A map cell whose legend entry is `["cube", "w"]` is a loose cube. Pressing toward one merges it into the player's block without moving, and pressing again rolls the block, which tips like any rectangular prism. Every cube keeps its own faces and answers for the cell under it, a block of three or more can hang its middle over a void, and only a block lying along the press, or a lone cube, can take on another. A level with loose cubes runs through `tryBlockMove` in `src/core/rules.ts`, and every other level never reaches it. The editor's Loose cube tool places them, so a player can build, test, save and share a merge level.

## Commands

| Command             | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `just check`        | Lints and type-checks                                          |
| `just test`         | Runs the fast unit tests and golden checks                     |
| `just coverage`     | Runs the unit tests and reports coverage of `src/core/`        |
| `just test-browser` | Builds, then runs the Playwright browser tests                 |
| `just verify`       | Runs every check, the unit tests and the browser tests         |
| `just build`        | Writes `dist/`                                                 |
| `just deploy`       | Uploads `dist/` to the Cloudflare Pages project `cublitz`      |
| `just icons`        | Renders the app icons in `public/icons/` from `scripts/icons/` |
| `just og-image`     | Renders the link preview image `public/og.png`                 |

Tool versions are pinned in `.mise/config.toml`.

The toolchain is synced from `~/projects/typescript-template` on Vite+. Node matches the template, but changing it needs a check that `tests/golden/` still matches, because generated levels depend on the V8 version. Formatting uses [oxfmt-next-line](https://www.npmjs.com/package/oxfmt-next-line), a fork of oxfmt that puts opening braces on their own line, installed by mise and configured in `.oxfmtrc.json`; `vite.config.ts` sets `check.fmt: false` so `vp check` does not run Vite+'s bundled oxfmt. A few things differ from the template on purpose. The formatter skips `index.html`, `src/styles/`, `src/core/levels.ts` and `tests/golden/`, whose layout is hand-kept. The `lint` block in `vite.config.ts` ends with overrides that turn off the rules the existing code breaks, with a count for each, and the Storybook overrides are gone because the project has no stories.

## Tests

`tests/unit/` tests the pure game in `src/core/` rule by rule, including malformed levels a share code could carry, and the page modules in `src/ui/` that run without a browser.

`tests/browser/` runs scripted sessions against the built `dist/` in Playwright. `tests/browser/harness/session.ts` drives one page and captures a snapshot after every step, and `tests/browser/harness/instruments.ts` makes it deterministic: it pins `Math.random` and `Date`, replaces `AudioContext` with a recorder, holds timers of a second or more and intervals until a script fires them, and holds back resize events the browser sends on its own. Google Fonts requests are answered with an empty stylesheet.

`tests/golden/solve-post-fix.json` holds each campaign level's `solve()` result and `tests/golden/infinite-post-fix.json` a sample of generated infinite levels. `tests/browser/cross-engine.spec.ts` generates levels from one seed in Chromium, Firefox and WebKit and compares them with each other and with the golden file, so `just test-browser` needs all three browsers. The test server serves `src/core/` with its types stripped so a page can import the generator directly. Changing the generator changes which levels a saved run continues on, while the saved run itself keeps working, because it stores a seed and a position and not the levels.
