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
	// Partial raster repaints only the dirty part of a tile, so a rounded corner's pixels depend on which frames ran.
	// Under load, the original compared with itself differed by 1 or 2 of 255 on 14 to 42 such pixels, failing 3 of 80
	// screenshot runs, as dist did 4 of 80. Without partial raster, dist passed all of 200 such runs.
	use: {browserName: "chromium", launchOptions: {args: ["--disable-partial-raster"]}},
	webServer: {
		command: "node tests/browser/harness/serve.ts",
		url: `http://127.0.0.1:${port}/legacy/original.html`,
		reuseExistingServer: false,
	},
});
