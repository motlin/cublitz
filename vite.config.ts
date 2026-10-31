import {readFileSync} from "node:fs";
import {defineConfig, type Plugin} from "vite-plus";
import {keepOriginalGlobalScope, topLevelNames} from "./scripts/original-global-scope.ts";
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
			const chunks = Object.values(bundle).filter((output) => output.type === "chunk");
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
			for (const output of Object.values(bundle)) if (output !== page) delete bundle[output.fileName];
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
				files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
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
			// The game keeps the original script's behaviour and shipped bytes, so these findings stay until a change can be proven against dist. The number is how many findings each rule had at the template sync.
			{
				files: ["src/**/*.ts"],
				rules: {
					"@typescript-eslint/consistent-return": "off", // 3
					"@typescript-eslint/no-confusing-void-expression": "off", // 42
					"@typescript-eslint/no-deprecated": "off", // 2
					"@typescript-eslint/no-dynamic-delete": "off", // 3
					"@typescript-eslint/no-floating-promises": "off", // 2
					"@typescript-eslint/no-misused-spread": "off", // 3
					"@typescript-eslint/no-non-null-assertion": "off", // 153
					"@typescript-eslint/no-unnecessary-condition": "off", // 14
					"@typescript-eslint/no-unnecessary-type-assertion": "off", // 3
					"@typescript-eslint/no-unnecessary-type-parameters": "off", // 1
					"@typescript-eslint/no-unsafe-type-assertion": "off", // 56
					"@typescript-eslint/prefer-nullish-coalescing": "off", // 43
					"@typescript-eslint/prefer-optional-chain": "off", // 21
					"@typescript-eslint/prefer-string-starts-ends-with": "off", // 1
					"import/no-cycle": "off", // 37
					"no-negated-condition": "off", // 2
					"no-shadow": "off", // 4
					"promise/always-return": "off", // 2
					"unicorn/consistent-function-scoping": "off", // 2
					"unicorn/no-array-sort": "off", // 2
					"unicorn/prefer-add-event-listener": "off", // 37
					"unicorn/prefer-set-has": "off", // 1
				},
			},
			// Existing test and harness code, written before this lint block. The number is how many findings each rule had at the template sync.
			{
				files: ["tests/**/*.ts"],
				rules: {
					"@typescript-eslint/no-confusing-void-expression": "off", // 16
					"@typescript-eslint/no-deprecated": "off", // 3
					"@typescript-eslint/no-implied-eval": "off", // 1
					"@typescript-eslint/no-misused-promises": "off", // 1
					"@typescript-eslint/no-misused-spread": "off", // 3
					"@typescript-eslint/no-unnecessary-condition": "off", // 2
					"@typescript-eslint/no-unnecessary-type-assertion": "off", // 5
					"@typescript-eslint/no-unnecessary-type-parameters": "off", // 1
					"@typescript-eslint/no-unsafe-argument": "off", // 1
					"@typescript-eslint/no-unsafe-call": "off", // 1
					"@typescript-eslint/no-unsafe-return": "off", // 1
					"@typescript-eslint/no-unsafe-type-assertion": "off", // 23
					"@typescript-eslint/non-nullable-type-assertion-style": "off", // 45
					"@typescript-eslint/prefer-includes": "off", // 8
					"@typescript-eslint/promise-function-async": "off", // 63
					"@typescript-eslint/require-await": "off", // 1
					"@typescript-eslint/unbound-method": "off", // 5
					"no-await-in-loop": "off", // 49
					"no-underscore-dangle": "off", // 12
					"no-useless-concat": "off", // 1
					"oxc/no-map-spread": "off", // 2
					"unicorn/consistent-function-scoping": "off", // 27
					"unicorn/no-array-fill-with-reference-type": "off", // 5
					"unicorn/no-array-sort": "off", // 6
					"vitest/require-mock-type-parameters": "off", // 1
					"vitest/require-to-throw-message": "off", // 1
				},
			},
			// Existing build scripts, written before this lint block. The number is how many findings each rule had at the template sync.
			{
				files: ["scripts/**/*.ts", "*.config.ts"],
				rules: {
					"@typescript-eslint/no-confusing-void-expression": "off", // 1
					"@typescript-eslint/no-deprecated": "off", // 1
					"@typescript-eslint/no-dynamic-delete": "off", // 1
					"@typescript-eslint/no-non-null-assertion": "off", // 7
					"@typescript-eslint/no-unsafe-type-assertion": "off", // 4
					"@typescript-eslint/non-nullable-type-assertion-style": "off", // 1
					"no-control-regex": "off", // 1
				},
			},
		],
		options: {
			typeAware: true,
			typeCheck: true,
		},
	},
	plugins: [shipSingleFilePage()],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		minify: false,
		target: "esnext",
		modulePreload: {polyfill: false},
	},
});
