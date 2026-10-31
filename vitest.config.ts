import {defineConfig} from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/unit/**/*.test.ts"],
		environment: "node",
		pool: "threads",
		testTimeout: 60_000,
		coverage: {provider: "v8", include: ["src/core/**/*.ts"], reporter: ["text"]},
	},
});
