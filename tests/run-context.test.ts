import { describe, expect, it } from "vitest";
import {
	DEFAULT_RUNS_ROOT,
	resolveRuntimeLogFilePath,
	resolveRuntimeRunId,
	resolveRuntimeRunRoot,
	sanitizeRunId,
} from "../packages/runtime-observability/src/run-context.js";

describe("runtime run context", () => {
	it("accepts valid run ids and rejects invalid ones", () => {
		expect(sanitizeRunId("ci-gate-123")).toBe("ci-gate-123");
		expect(() => sanitizeRunId(" bad/run ")).toThrow("Invalid run id");
	});

	it("prefers OPENUI_RUNTIME_RUN_ID over OPENUI_CI_GATE_RUN_KEY", () => {
		expect(
			resolveRuntimeRunId({
				OPENUI_RUNTIME_RUN_ID: "runtime-123",
				OPENUI_CI_GATE_RUN_KEY: "ci-gate-456",
			}),
		).toBe("runtime-123");
	});

	it("falls back to OPENUI_CI_GATE_RUN_KEY when runtime run id is absent", () => {
		expect(
			resolveRuntimeRunId({
				OPENUI_CI_GATE_RUN_KEY: "ci-gate-456",
			}),
		).toBe("ci-gate-456");
	});

	it("generates an mcp runtime id when no explicit run key exists", () => {
		const runId = resolveRuntimeRunId({});
		expect(runId).toMatch(/^mcp-runtime-\d+$/);
	});

	it("builds run root and log file paths under the governed runs root", () => {
		expect(resolveRuntimeRunRoot("/workspace", "ci-gate-456")).toBe(
			`/workspace/${DEFAULT_RUNS_ROOT}/ci-gate-456`,
		);
		expect(
			resolveRuntimeLogFilePath("/workspace", "ci-gate-456", "tests"),
		).toBe(`/workspace/${DEFAULT_RUNS_ROOT}/ci-gate-456/logs/tests.jsonl`);
		expect(resolveRuntimeLogFilePath("/workspace", "ci-gate-456")).toBe(
			`/workspace/${DEFAULT_RUNS_ROOT}/ci-gate-456/logs/runtime.jsonl`,
		);
	});
});
