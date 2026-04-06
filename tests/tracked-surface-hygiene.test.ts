import { describe, expect, it } from "vitest";
import { runTrackedSurfaceHygieneCheck } from "../tooling/check-tracked-surface-hygiene.mjs";

describe("tracked surface hygiene", () => {
	it("passes when tracked files stay out of ignored agent, runtime, and log surfaces", async () => {
		const result = await runTrackedSurfaceHygieneCheck({
			trackedFiles: [
				"README.md",
				"AGENTS.md",
				"CLAUDE.md",
				"docs/index.md",
				"tooling/check-tracked-surface-hygiene.mjs",
			],
		});

		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it("fails when forbidden tracked directories or logs are present", async () => {
		const result = await runTrackedSurfaceHygieneCheck({
			trackedFiles: [
				".agents/Plans/example.md",
				".runtime-cache/runs/abc/logs/runtime.jsonl",
				"logs/server.log",
			],
		});

		expect(result.ok).toBe(false);
		expect(result.errors).toEqual([
			"forbidden tracked directory surface: .agents/Plans/example.md",
			"forbidden tracked directory surface: .runtime-cache/runs/abc/logs/runtime.jsonl",
			"forbidden tracked directory surface: logs/server.log",
		]);
	});
});
