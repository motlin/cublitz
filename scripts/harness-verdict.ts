import {stripVTControlCharacters} from "node:util";

// Reads a Playwright JSON report. A non-zero exit alone proves nothing: "No tests found", a port already in use and
// a browser that will not start all exit non-zero too, and would otherwise count as a caught mutant.
type Result = {status: string; error?: {message: string}};
type Spec = {title: string; file?: string; tests: {results: Result[]}[]};
type Suite = {specs?: Spec[]; suites?: Suite[]};
export type PlaywrightReport = {errors: {message: string}[]; suites?: Suite[]};
export type Verdict = {kind: "passed"} | {kind: "caught"; detail: string} | {kind: "invalid"; detail: string};

const INFRASTRUCTURE =
	/net::ERR_|ECONNREFUSED|browserType\.launch|Executable doesn't exist|Target page, context or browser has been closed/;

const allSpecs = (suites: Suite[] = []): Spec[] =>
	suites.flatMap((suite) => [...(suite.specs ?? []), ...allSpecs(suite.suites)]);
const resultsOf = (spec: Spec): Result[] => spec.tests.flatMap((t) => t.results);

const firstLine = (message: string): string => (stripVTControlCharacters(message).split("\n")[0] ?? "").slice(0, 160);

export function verdict(exitCode: number | null, report: PlaywrightReport | null): Verdict {
	if (!report) return {kind: "invalid", detail: "no report was written"};
	const [globalError] = report.errors;
	if (globalError) return {kind: "invalid", detail: firstLine(globalError.message)};
	const results = allSpecs(report.suites).flatMap(resultsOf);
	if (results.length === 0) return {kind: "invalid", detail: "no test ran"};
	const failed = results.filter((r) => r.status === "failed").map((r) => firstLine(r.error?.message ?? "no message"));
	const real = failed.find((message) => !INFRASTRUCTURE.test(message));
	if (real) return {kind: "caught", detail: real};
	const [infrastructure] = failed;
	if (infrastructure) return {kind: "invalid", detail: infrastructure};
	if (results.some((r) => r.status !== "passed")) return {kind: "invalid", detail: "no test failed on an assertion"};
	return exitCode === 0
		? {kind: "passed"}
		: {kind: "invalid", detail: `exit code ${exitCode} with every test passing`};
}

/** Whether a grep still selects a test that passed in the control run, so that a renamed test cannot go unnoticed. */
export function grepMatchedPassingTest(control: PlaywrightReport, grep: string): boolean {
	const pattern = new RegExp(grep);
	return allSpecs(control.suites).some(
		(spec) =>
			pattern.test(`${spec.file ?? ""} ${spec.title}`) && resultsOf(spec).every((r) => r.status === "passed"),
	);
}
