import {describe, expect, it} from "vite-plus/test";
import {grepMatchedPassingTest, type PlaywrightReport, verdict} from "../../scripts/harness-verdict.ts";

const spec = (title: string, status: string, message?: string) => ({
	title,
	file: "a.spec.ts",
	tests: [{results: [{status, ...(message ? {error: {message}} : {})}]}],
});
const report = (specs: ReturnType<typeof spec>[], errors: {message: string}[] = []): PlaywrightReport => ({
	errors,
	suites: [{specs, suites: [{specs: []}]}],
});

describe("verdict", () => {
	it("is passed when tests ran and all passed", () => {
		expect(verdict(0, report([spec("t", "passed")]))).toStrictEqual({kind: "passed"});
	});

	it("is caught when a test fails on an assertion", () => {
		expect(verdict(1, report([spec("t", "failed", "Error: expect(received).toBe(expected)")]))).toStrictEqual({
			kind: "caught",
			detail: "Error: expect(received).toBe(expected)",
		});
	});

	it("is invalid when no test matched, which also exits non-zero", () => {
		expect(verdict(1, report([], [{message: "Error: No tests found"}]))).toStrictEqual({
			kind: "invalid",
			detail: "Error: No tests found",
		});
	});

	it("is invalid when zero tests ran with no error", () => {
		expect(verdict(1, report([]))).toStrictEqual({kind: "invalid", detail: "no test ran"});
	});

	it("is invalid when the run left no report at all", () => {
		expect(verdict(1, null)).toStrictEqual({kind: "invalid", detail: "no report was written"});
	});

	it("is invalid when the web server could not start, even if a test also failed", () => {
		expect(
			verdict(1, report([spec("t", "failed", "Error: boom")], [{message: "Error: port 4818 is already used"}])),
		).toStrictEqual({
			kind: "invalid",
			detail: "Error: port 4818 is already used",
		});
	});

	it("is invalid when the only failures are infrastructure", () => {
		expect(
			verdict(1, report([spec("t", "failed", "Error: page.goto: net::ERR_CONNECTION_REFUSED")])),
		).toStrictEqual({
			kind: "invalid",
			detail: "Error: page.goto: net::ERR_CONNECTION_REFUSED",
		});
		expect(
			verdict(1, report([spec("t", "failed", "Error: browserType.launch: Executable doesn't exist")])),
		).toStrictEqual({
			kind: "invalid",
			detail: "Error: browserType.launch: Executable doesn't exist",
		});
	});

	it("is invalid when the failure is a timeout, since nothing was compared", () => {
		expect(verdict(1, report([spec("t", "timedOut", "Test timeout of 300000ms exceeded.")]))).toStrictEqual({
			kind: "invalid",
			detail: "no test failed on an assertion",
		});
	});

	it("is caught when one real failure sits beside an infrastructure failure", () => {
		expect(
			verdict(
				1,
				report([spec("a", "failed", "Error: net::ERR_ABORTED"), spec("b", "failed", "Error: expect failed")]),
			),
		).toStrictEqual({
			kind: "caught",
			detail: "Error: expect failed",
		});
	});

	it("is invalid when the exit code says failure but every test passed", () => {
		expect(verdict(1, report([spec("t", "passed")]))).toStrictEqual({
			kind: "invalid",
			detail: "exit code 1 with every test passing",
		});
	});

	it("is invalid when the process was killed", () => {
		expect(verdict(null, report([spec("t", "passed")]))).toStrictEqual({
			kind: "invalid",
			detail: "exit code null with every test passing",
		});
	});

	it("finds failures in nested suites", () => {
		const nested: PlaywrightReport = {
			errors: [],
			suites: [{suites: [{specs: [spec("t", "failed", "Error: nested")]}]}],
		};
		expect(verdict(1, nested)).toStrictEqual({kind: "caught", detail: "Error: nested"});
	});

	it("strips color codes from the detail and keeps its first line, cut short", () => {
		const message = `\u001b[31mError: ${"x".repeat(200)}\u001b[0m\nsecond line`;
		expect(verdict(1, report([spec("t", "failed", message)]))).toStrictEqual({
			kind: "caught",
			detail: `Error: ${"x".repeat(153)}`,
		});
	});
});

describe("grepMatchedPassingTest", () => {
	const control = report([spec("level 3 Blue Fence", "passed"), spec("broken one", "failed", "Error: x")]);

	it("is true when the grep selects a test that passed", () => {
		expect(grepMatchedPassingTest(control, "Blue Fence")).toBe(true);
	});

	it("is false for a grep no test matches, as after a rename", () => {
		expect(grepMatchedPassingTest(control, "Red Fence")).toBe(false);
	});

	it("is false when the only match did not pass", () => {
		expect(grepMatchedPassingTest(control, "broken one")).toBe(false);
	});
});
