import {existsSync, readFileSync} from "node:fs";
import {expect, it} from "vite-plus/test";
import viteConfig from "../../vite.config.ts";

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

it("pins the template's tools, including its Node, which the goldens depend on", () => {
	expect(read(".mise/config.toml")).toBe(`[tools]
just = "1.58.0"
# Same as the template. Generated levels depend on the V8 version, so re-check tests/golden/ when changing it.
node = "26.13.0"
pnpm = "12.12.1"
pre-commit = "4.6.2"
# pre-commit and its pre-commit-hooks and yamllint hooks run on Python. Pin it
# here, since mise refuses a python3 shim that resolves back to itself.
python = "3.15.0"

[env]
_.path = ["{{config_root}}/node_modules/.bin"]
`);
});

it("runs every package script through the template's tools and keeps the project's own", () => {
	const manifest = JSON.parse(read("package.json")) as {scripts: unknown; packageManager: unknown};
	expect({scripts: manifest.scripts, packageManager: manifest.packageManager}).toStrictEqual({
		scripts: {
			preinstall: "npx only-allow pnpm",
			dev: "vp dev",
			preview: "vp preview",
			build: "vp build",
			oxlint: "vp lint . --fix",
			"oxlint:ci": "vp lint . --format github",
			fmt: "vp fmt",
			"fmt:ci": "vp fmt --check",
			fallow: "fallow fix --yes --no-create-config",
			"fallow:ci": "fallow dead-code",
			typecheck: "tsc --noEmit",
			test: "node node_modules/vitest/dist/cli.js",
			"test:browser": "vp build && playwright test",
			golden: "node scripts/generate-golden.ts",
			"prove-harness": "node scripts/prove-harness.ts",
			deploy: "wrangler pages deploy --branch main",
			prepare: "VITE_GIT_HOOKS=0 vp config",
		},
		packageManager: "pnpm@12.12.1",
	});
});

it("carries the template's fmt and run blocks, with the byte-exact page sources left unformatted", () => {
	expect({fmt: viteConfig.fmt, run: viteConfig.run}).toStrictEqual({
		fmt: {
			semi: true,
			singleQuote: false,
			useTabs: true,
			tabWidth: 4,
			printWidth: 120,
			proseWrap: "never",
			embeddedLanguageFormatting: "off",
			bracketSpacing: false,
			trailingComma: "all",
			arrowParens: "always",
			ignorePatterns: ["legacy/**", "index.html", "src/styles/**", "src/core/levels.ts", "tests/golden/**"],
			overrides: [
				{files: [".yamllint.yaml", "**/*.yaml", "**/*.yml"], options: {useTabs: false, tabWidth: 2}},
				{files: ["**/*.md"], options: {printWidth: 320}},
			],
		},
		run: {
			tasks: {
				check: {command: "vp check"},
				"test:run": {
					command: "node node_modules/vitest/dist/cli.js run",
					cache: {input: [{auto: true}, "!node_modules/.vitest-cache/**"], output: []},
				},
			},
		},
	});
});

it("carries the template's lint settings and adds the project's overrides after them", () => {
	const lint = viteConfig.lint;
	expect({
		plugins: lint?.plugins,
		categories: lint?.categories,
		options: lint?.options,
		lastOverrideFiles: lint?.overrides?.slice(-8).map((override) => override.files),
	}).toStrictEqual({
		plugins: ["typescript", "unicorn", "oxc", "import", "react", "vitest", "promise", "node", "jsx-a11y"],
		categories: {correctness: "error", suspicious: "error", perf: "error"},
		options: {typeAware: true, typeCheck: true},
		lastOverrideFiles: [
			["src/**/*.ts"],
			["tests/**/*.ts"],
			["tests/browser/**/*.ts"],
			["tests/browser/harness/instruments.ts"],
			["tests/support/original-engine.ts"],
			["scripts/original-global-scope.ts", "tests/unit/original-strings.test.ts"],
			["scripts/**/*.ts"],
			["vite.config.ts"],
		],
	});
});

it("keeps the lint settings in vite.config.ts with no stale oxlint config beside it", () => {
	expect(existsSync(new URL("../../.oxlintrc.json", import.meta.url))).toBe(false);
});

it("names the Vite process and the harness server after the project", () => {
	const titles = [read("vite.config.ts"), read("tests/browser/harness/serve.ts")].map(
		(source) => /^process\.title = "(.*)";$/m.exec(source)?.[1],
	);
	expect(titles).toStrictEqual(["cublitz", "cublitz-harness"]);
});

it("keeps the Cloudflare Pages deploy on the current action pins", () => {
	const deploy = read(".github/workflows/deploy.yml");
	expect({
		wrangler: read("wrangler.toml").includes('pages_build_output_dir = "dist"'),
		deploys: deploy.includes("node_modules/.bin/wrangler pages deploy --branch main"),
		noCacheForCredentialsJob: deploy.includes("cache: false"),
		runsBrowserHarness: deploy.includes("just test-browser"),
		stalePins: /mise-action@(?!9b200bcecbfd6303e69a4a261b2e09e3757440a7)|cache: true/.test(deploy),
	}).toStrictEqual({
		wrangler: true,
		deploys: true,
		noCacheForCredentialsJob: true,
		runsBrowserHarness: true,
		stalePins: false,
	});
});
