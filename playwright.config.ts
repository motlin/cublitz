import {defineConfig} from "@playwright/test";

const port = process.env["CUBLITZ_PORT"] ?? "4817";

export default defineConfig({
	testDir: "tests/browser",
	testMatch: "*.spec.ts",
	fullyParallel: true,
	workers: process.env["CI"] ? 2 : 4,
	timeout: 300_000,
	reporter: process.env["CI"] ? "github" : "line",
	forbidOnly: !!process.env["CI"],
	use: {browserName: "chromium"},
	webServer: {
		command: "node tests/browser/harness/serve.ts",
		url: `http://127.0.0.1:${port}/legacy/original.html`,
		reuseExistingServer: false,
	},
});
