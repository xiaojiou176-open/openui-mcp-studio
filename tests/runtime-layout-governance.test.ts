import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRuntimeLayoutCheck } from "../tooling/check-runtime-layout.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const MINIMAL_RUNTIME_LAYOUT_CONTRACT = {
	version: 1,
	runtimeRoot: ".runtime-cache",
	runsRoot: ".runtime-cache/runs",
	requiredRunFiles: ["summary.json"],
	requiredRunDirectories: ["artifacts"],
	requiredLogFiles: ["runtime.jsonl"],
};

const REQUIRED_FILE_SNIPPETS = {
	"tooling/ci-gate.mjs": [
		".runtime-cache/runs",
		"summary.json",
		"quality-score.json",
	],
	"tooling/ci-gate/summary-file.mjs": [".runtime-cache/runs", "summary.json"],
	"tooling/quality-score.mjs": [".runtime-cache/runs", "quality-score.json"],
	"tooling/evidence-index.mjs": [
		".runtime-cache/runs",
		"summaryPath",
		"qualityScorePath",
		"evidence/index.json",
	],
	"tooling/check-evidence-governance.mjs": [
		".runtime-cache/runs",
		"quality score file",
	],
	"services/mcp-server/src/logger.ts": [".runtime-cache/runs", "runtime.jsonl"],
} as const;

describe("runtime layout governance", () => {
	it("reports a missing required source file as a structured error", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-runtime-layout-"),
		);
		try {
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				MINIMAL_RUNTIME_LAYOUT_CONTRACT,
			);

			for (const [filePath, snippets] of Object.entries(
				REQUIRED_FILE_SNIPPETS,
			)) {
				if (filePath === "tooling/quality-score.mjs") {
					continue;
				}
				await writeFile(path.join(rootDir, filePath), snippets.join("\n"));
			}

			const result = await runRuntimeLayoutCheck({ rootDir });
			expect(result.ok).toBe(false);
			expect(result.errors).toContain(
				"required runtime-layout source file is missing: tooling/quality-score.mjs",
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
