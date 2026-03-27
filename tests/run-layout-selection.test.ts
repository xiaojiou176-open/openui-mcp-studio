import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLatestRunId } from "../tooling/shared/run-layout.mjs";

async function writeJson(filePath: string, value: unknown) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("run layout selection", () => {
	it("prefers the latest run that satisfies required files instead of the latest directory only", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openui-run-layout-"));
		try {
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				{
					version: 1,
					runsRoot: ".runtime-cache/runs",
					logChannels: ["runtime", "tests", "ci", "upstream"],
				},
			);
			await fs.mkdir(
				path.join(rootDir, ".runtime-cache", "runs", "mcp-runtime-999", "logs"),
				{ recursive: true },
			);
			await fs.writeFile(
				path.join(
					rootDir,
					".runtime-cache",
					"runs",
					"mcp-runtime-999",
					"logs",
					"runtime.jsonl",
				),
				"",
				"utf8",
			);
			await writeJson(
				path.join(rootDir, ".runtime-cache", "runs", "ci-gate-123", "summary.json"),
				{ runId: "ci-gate-123" },
			);

			const result = await resolveLatestRunId({
				rootDir,
				requiredRunFiles: ["summary.json"],
			});

			expect(result).toBe("ci-gate-123");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("can require an authoritative run manifest when selecting the latest run", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openui-run-layout-auth-"));
		try {
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				{
					version: 1,
					runsRoot: ".runtime-cache/runs",
					logChannels: ["runtime", "tests", "ci", "upstream"],
				},
			);
			await writeJson(
				path.join(rootDir, ".runtime-cache", "runs", "ci-gate-older", "summary.json"),
				{ runId: "ci-gate-older" },
			);
			await writeJson(
				path.join(rootDir, ".runtime-cache", "runs", "ci-gate-older", "meta", "run.json"),
				{ runId: "ci-gate-older", authoritative: true },
			);
			await writeJson(
				path.join(rootDir, ".runtime-cache", "runs", "ci-gate-newer", "summary.json"),
				{ runId: "ci-gate-newer" },
			);
			await writeJson(
				path.join(rootDir, ".runtime-cache", "runs", "ci-gate-newer", "meta", "run.json"),
				{ runId: "ci-gate-newer", authoritative: false },
			);

			const result = await resolveLatestRunId({
				rootDir,
				requiredRunFiles: ["summary.json", "meta/run.json"],
				requireAuthoritativeManifest: true,
			});

			expect(result).toBe("ci-gate-older");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
