import {defineConfig} from "@playwright/test";

const port = process.env["CUBLITZ_PORT"] ?? "4817";

export default defineConfig(
	{
		testDir: "tests/browser",
		testMatch: "*.spec.ts",
		fullyParallel: true,
		// Most tests spend their time waiting on the page rather than on a core, so locally run more of them than half the cores.
		workers: process.env["CI"] ? 2 : "75%",
		timeout: 300_000,
		reporter: process.env["CI"] ? "github" : "line",
		forbidOnly: !!process.env["CI"],
		// Partial raster repaints only the dirty part of a tile, so a rounded corner's pixels depend on which frames ran,
		// and pixel comparisons between screenshots of the same page flake without it.
		use:
		{
			browserName: "chromium",
			launchOptions:
			{
				args: ["--disable-partial-raster"],
			},
		},
		webServer:
		{
			command: "node tests/browser/harness/serve.ts",
			url: `http://127.0.0.1:${port}/`,
			reuseExistingServer: false,
		},
	},
);
