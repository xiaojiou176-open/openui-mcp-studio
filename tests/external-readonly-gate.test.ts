import { afterEach, describe, expect, it, vi } from "vitest";
import {
	parseExternalReadonlyGateArgs,
	runExternalReadonlyGate,
} from "../tooling/run-external-readonly-gate.mjs";

describe("external readonly gate runner", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("parses --enforce flag", () => {
		expect(parseExternalReadonlyGateArgs([])).toEqual({ enforce: false });
		expect(parseExternalReadonlyGateArgs(["--enforce"])).toEqual({
			enforce: true,
		});
	});

	it("rejects unknown cli flags", () => {
		expect(() => parseExternalReadonlyGateArgs(["--unknown"])).toThrow(
			/unknown argument/i,
		);
	});

	it("prints explicit skip notice in report-only mode", () => {
		const stdout = { write: vi.fn() };

		const exitCode = runExternalReadonlyGate({
			enforce: false,
			stdout: stdout as unknown as NodeJS.WriteStream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.write).toHaveBeenCalledWith(
			expect.stringContaining("SKIPPED (explicit)"),
		);
	});

	it("runs external e2e command in enforce mode", () => {
		const run = vi.fn().mockReturnValue({ status: 0 });

		const exitCode = runExternalReadonlyGate({
			enforce: true,
			run,
			stdout: { write: vi.fn() } as unknown as NodeJS.WriteStream,
			stderr: { write: vi.fn() } as unknown as NodeJS.WriteStream,
		});

		expect(exitCode).toBe(0);
		expect(run).toHaveBeenCalledWith(
			expect.stringMatching(/npm(?:\.cmd)?$/),
			["run", "test:e2e:external"],
			expect.objectContaining({ stdio: "inherit" }),
		);
	});

	it("returns non-zero when spawn fails", () => {
		const run = vi.fn().mockReturnValue({ error: new Error("ENOENT") });
		const stderr = { write: vi.fn() };

		const exitCode = runExternalReadonlyGate({
			enforce: true,
			run,
			stdout: { write: vi.fn() } as unknown as NodeJS.WriteStream,
			stderr: stderr as unknown as NodeJS.WriteStream,
		});

		expect(exitCode).toBe(1);
		expect(stderr.write).toHaveBeenCalledWith(
			expect.stringContaining("failed to execute npm run test:e2e:external"),
		);
	});
});
