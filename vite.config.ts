import {readFileSync} from "node:fs";
import {defineConfig, type Plugin} from "vite-plus";
import {keepOriginalGlobalScope, topLevelNames} from "./scripts/original-global-scope.ts";
import {serviceWorker, SW_FILE} from "./scripts/service-worker-build.ts";
import {inlineStylesheets, plainRegionComments} from "./scripts/single-file-page.ts";

process.title = "cublitz";

const APP_TAG = '<script type="module" src="/src/main.ts"></script>';

// Original globals no game code needs under these names: two it never reads, and storage keys that the
// modules keep in one table. Tree shaking and constant inlining would drop them from any source declaration.
const UNUSED_ORIGINAL_GLOBALS = `var ARROW = { N:'↑', S:'↓', E:'→', W:'←' };
var skipArmed = null;
var TIPS_KEY = 'cubist-tips-seen-v1';
var INF_RUN_KEY = 'cublitz-infinite-run-v1', INF_BEST_KEY = 'cublitz-infinite-best-v1';
var DRAFT_KEY = 'cubist-editor-draft-v1', MINE_KEY = 'cubist-my-levels-v1';
var PAL_KEY = 'cubist-colors-v1';
`;

const originalScript = (): string => {
	const script = /(?<=<script>\n)[\s\S]*(?=<\/script>)/.exec(readFileSync("legacy/original.html", "utf8"))?.[0];
	if (!script) throw new Error("legacy/original.html has no inline script");
	return script;
};

// The shipped page has to stay the original single file. Vite would minify the CSS and move it and the
// script to deferred external files, which can paint the page before the game has set it up. So the raw
// page goes out with its CSS back in place and the bundled code as a classic inline script in its spot.
function shipSingleFilePage(): Plugin {
	return {
		name: "ship-single-file-page",
		enforce: "post",
		generateBundle(_options, bundle) {
			const page = bundle["index.html"];
			if (page?.type !== "asset") throw new Error("index.html is missing from the bundle");
			const chunks = Object.values(bundle)
				.filter((output) => output.type === "chunk")
				.filter((chunk) => chunk.fileName !== SW_FILE);
			const [chunk] = chunks;
			if (!chunk || chunks.length !== 1) throw new Error(`Expected one script chunk, got ${chunks.length}`);
			if (/<\/script/i.test(chunk.code)) throw new Error("The script would close its own inline tag");
			const raw = inlineStylesheets(readFileSync("index.html", "utf8"), (path) => readFileSync(path, "utf8"));
			if (raw.split(APP_TAG).length !== 2) throw new Error(`index.html must contain ${APP_TAG} exactly once`);
			const script = keepOriginalGlobalScope(
				UNUSED_ORIGINAL_GLOBALS + plainRegionComments(chunk.code),
				topLevelNames(originalScript()),
			);
			page.source = raw.replace(APP_TAG, () => `<script>\n${script}</script>`);
			for (const output of Object.values(bundle))
				if (output !== page && output.fileName !== SW_FILE) delete bundle[output.fileName];
		},
	};
}

export default defineConfig({
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
			{
				files: [".yamllint.yaml", "**/*.yaml", "**/*.yml"],
				options: {
					useTabs: false,
					tabWidth: 2,
				},
			},
			{
				files: ["**/*.md"],
				options: {
					printWidth: 320,
				},
			},
		],
	},
	run: {
		tasks: {
			// Add dependsOn here for code generation that type-aware lint needs.
			check: {
				command: "vp check",
			},
			"test:run": {
				command: "node node_modules/vitest/dist/cli.js run",
				cache: {
					input: [{auto: true}, "!node_modules/.vitest-cache/**"],
					output: [],
				},
			},
		},
	},
	lint: {
		plugins: ["typescript", "unicorn", "oxc", "import", "react", "vitest", "promise", "node", "jsx-a11y"],
		jsPlugins: [
			{
				name: "vite-plus",
				specifier: "vite-plus/oxlint-plugin",
			},
		],
		categories: {
			correctness: "error",
			suspicious: "error",
			perf: "error",
		},
		rules: {
			"vite-plus/prefer-vite-plus-imports": "error",
			"react/react-in-jsx-scope": "off",
			"no-case-declarations": "error",
			"no-empty": "error",
			"no-fallthrough": "error",
			"no-prototype-builtins": "error",
			"no-regex-spaces": "error",
			"import/no-unassigned-import": ["error", {allow: ["**/*.css"]}],
			"no-unused-vars": [
				"error",
				{
					varsIgnorePattern: "^([A-Z_]|_)",
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			"react-hooks/rules-of-hooks": "error",
			eqeqeq: ["error", "smart"],
			"react/only-export-components": [
				"warn",
				{
					allowConstantExport: true,
				},
			],
		},
		env: {
			builtin: true,
		},
		ignorePatterns: [
			"dist",
			"build",
			"storybook-static",
			".llm/**",
			"vitest.shims.d.ts",
			"legacy/**",
			"test-results/**",
		],
		overrides: [
			{
				files: ["public/**/*.{ts,tsx}"],
				globals: {
					ServiceWorkerGlobalScope: "readonly",
					ExtendableEvent: "readonly",
				},
			},
			{
				files: ["vite.config.ts", "vitest.config.ts"],
				globals: {
					process: "readonly",
				},
			},
			{
				files: ["**/*.test.{js,jsx,ts,tsx}", "**/*.spec.{js,jsx,ts,tsx}", "**/setupTests.{js,ts}"],
				globals: {
					vi: "readonly",
				},
				env: {
					browser: true,
					jest: true,
				},
			},
			{
				files: ["**/*.{js,jsx}"],
				rules: {
					"no-undef": "error",
					"no-redeclare": "error",
				},
				env: {
					es2020: true,
					browser: true,
					jest: true,
				},
			},
			{
				files: ["**/*.{ts,tsx}"],
				rules: {
					"@typescript-eslint/ban-ts-comment": [
						"error",
						{
							minimumDescriptionLength: 10,
						},
					],
					"no-array-constructor": "error",
					"@typescript-eslint/no-dynamic-delete": "error",
					"@typescript-eslint/no-empty-object-type": "error",
					"@typescript-eslint/no-invalid-void-type": "error",
					"@typescript-eslint/no-namespace": "error",
					"@typescript-eslint/no-non-null-asserted-nullish-coalescing": "error",
					"@typescript-eslint/no-explicit-any": "error",
					"@typescript-eslint/no-non-null-assertion": "error",
					"@typescript-eslint/no-require-imports": "error",
					"@typescript-eslint/no-unsafe-function-type": "error",
					"no-var": "error",
					"@typescript-eslint/prefer-literal-enum-member": "error",
					"@typescript-eslint/unified-signatures": "error",
					"@typescript-eslint/no-misused-promises": "error",
					"@typescript-eslint/require-await": "error",
					"@typescript-eslint/return-await": ["error", "error-handling-correctness-only"],
					"@typescript-eslint/only-throw-error": "error",
					"@typescript-eslint/switch-exhaustiveness-check": "error",
					"@typescript-eslint/prefer-nullish-coalescing": "error",
					"@typescript-eslint/restrict-plus-operands": "error",
					"@typescript-eslint/no-mixed-enums": "error",
					"@typescript-eslint/use-unknown-in-catch-callback-variable": "error",
					"@typescript-eslint/consistent-type-exports": "error",
					"@typescript-eslint/prefer-find": "error",
					"@typescript-eslint/prefer-includes": "error",
					"@typescript-eslint/prefer-string-starts-ends-with": "error",
					"@typescript-eslint/prefer-reduce-type-parameter": "error",
					"@typescript-eslint/prefer-return-this-type": "error",
					"@typescript-eslint/related-getter-setter-pairs": "error",
					"@typescript-eslint/non-nullable-type-assertion-style": "error",
					"@typescript-eslint/prefer-promise-reject-errors": "error",
					"@typescript-eslint/prefer-optional-chain": "error",
					"@typescript-eslint/no-unsafe-return": "error",
					"no-promise-executor-return": "error",
					"no-negated-condition": "error",
					"@typescript-eslint/no-confusing-void-expression": "error",
					"@typescript-eslint/promise-function-async": "error",
					"@typescript-eslint/dot-notation": ["error", {allowIndexSignaturePropertyAccess: true}],
					"@typescript-eslint/prefer-readonly": "error",
					"@typescript-eslint/no-deprecated": "error",
					"import/no-cycle": "error",
					"import/no-duplicates": "error",
					"@typescript-eslint/no-unsafe-assignment": "error",
					"@typescript-eslint/no-unsafe-member-access": "error",
					"@typescript-eslint/no-unsafe-call": "error",
					"@typescript-eslint/no-unsafe-argument": "error",
					"@typescript-eslint/no-unnecessary-condition": ["error", {allowConstantLoopConditions: true}],
					"@typescript-eslint/strict-boolean-expressions": "off", // Opted out: it forces `=== true` noise.
				},
				env: {
					es2020: true,
					browser: true,
					jest: true,
				},
			},
			{
				files: [
					"**/*.test.{ts,tsx}",
					"**/*.spec.{ts,tsx}",
					"tests/browser/harness/**/*.ts",
					"tests/support/**/*.ts",
				],
				rules: {
					"@typescript-eslint/no-explicit-any": "off",
					"@typescript-eslint/no-non-null-assertion": "off",
					"@typescript-eslint/no-unsafe-type-assertion": "off",
					"@typescript-eslint/no-unsafe-assignment": "off",
					"@typescript-eslint/no-unsafe-member-access": "off",
					"@typescript-eslint/no-unsafe-call": "off",
					"@typescript-eslint/no-unsafe-argument": "off",
					"vitest/no-identical-title": "error",
				},
			},
			// These stay off because no test can prove the change safe. The comment on each says why. The number is how many findings it had when last counted.
			{
				files: ["src/**/*.ts"],
				rules: {
					"@typescript-eslint/no-deprecated": "off", // 2: unescape and escape in share codes; replacing them risks which pasted codes still decode.
					"@typescript-eslint/no-non-null-assertion": "off", // 199: a check in place of each would add new failure paths to the shipped script.
					"@typescript-eslint/no-unnecessary-condition": "off", // 16: the session S is typed as always set but is empty until a level loads, so these guards are live.
					"@typescript-eslint/no-unsafe-type-assertion": "off", // 66: the casts cover DOM lookups and saved JSON; real guards would change what bad data does.
					"@typescript-eslint/prefer-nullish-coalescing": "off", // 43: || also replaces 0 and "", which saved data and share codes can hold.
					"import/no-cycle": "off", // 44: module order sets the order of top-level code in the bundle, and untangling the ui modules would change it.
					"unicorn/no-array-sort": "off", // 2: both sort a fresh array, and toSorted would drop browsers that run the game today.
					"unicorn/prefer-set-has": "off", // 1: COLORED is one of the original's page globals, and the harness requires it to stay an array.
				},
			},
			// Each step waits for the last, so the awaits in a loop are the point. The harness's own names on window start with two underscores to stay clear of the game's.
			{
				files: ["tests/**/*.ts"],
				rules: {
					"no-await-in-loop": "off",
					"no-underscore-dangle": "off",
				},
			},
			// Helpers here often go to the page as source text with the function that holds them, so they cannot move out of it.
			{
				files: ["tests/browser/**/*.ts"],
				rules: {
					"unicorn/consistent-function-scoping": "off",
				},
			},
			// The instruments keep the page's real methods aside and call them with the right this.
			{
				files: ["tests/browser/harness/instruments.ts"],
				rules: {
					"@typescript-eslint/unbound-method": "off",
				},
			},
			// This runs the original's own script, which arrives as text.
			{
				files: ["tests/support/original-engine.ts"],
				rules: {
					"@typescript-eslint/no-implied-eval": "off",
					"@typescript-eslint/no-unsafe-call": "off",
				},
			},
			// Both read the bundler's parser output. Moving off the deprecated parseAst could change the parse that shapes the shipped script.
			{
				files: ["scripts/original-global-scope.ts", "tests/unit/original-strings.test.ts"],
				rules: {
					"@typescript-eslint/no-deprecated": "off",
				},
			},
			// Parser output and JSON reports have no static type to check against.
			{
				files: ["scripts/**/*.ts"],
				rules: {
					"@typescript-eslint/no-unsafe-type-assertion": "off",
				},
			},
			// Rollup's documented way to drop a file from the bundle is to delete its key.
			{
				files: ["vite.config.ts"],
				rules: {
					"@typescript-eslint/no-dynamic-delete": "off",
				},
			},
		],
		options: {
			typeAware: true,
			typeCheck: true,
		},
	},
	plugins: [shipSingleFilePage(), serviceWorker()],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		minify: false,
		target: "esnext",
		modulePreload: {polyfill: false},
	},
});
