import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildKeysetDriftReport } from "../tooling/env-keyset-drift.mjs";

function buildEnvExample(keys: string[]) {
	return `${keys
		.map(
			(key) =>
				`# @env ${key}\n# description: test\n# default: value\n# validation: string\n# sensitive: false\n${key}=value`,
		)
		.join("\n\n")}\n`;
}

describe("env keyset drift", () => {
	it("passes when profile examples keep identical keyset with .env.example", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-env-keyset-pass-"),
		);
		const keys = ["GEMINI_API_KEY", "OPENUI_TIMEOUT_MS"];
		const envRaw = buildEnvExample(keys);

		try {
			await Promise.all([
				fs.writeFile(path.join(rootDir, ".env.example"), envRaw, "utf8"),
				fs.writeFile(
					path.join(rootDir, ".env.development.example"),
					envRaw,
					"utf8",
				),
				fs.writeFile(
					path.join(rootDir, ".env.staging.example"),
					envRaw,
					"utf8",
				),
				fs.writeFile(
					path.join(rootDir, ".env.production.example"),
					envRaw,
					"utf8",
				),
			]);

			const result = await buildKeysetDriftReport({ rootDir });
			expect(result.report.ok).toBe(true);
			expect(result.report.counts.driftTargets).toBe(0);
			await expect(fs.readFile(result.jsonPath, "utf8")).resolves.toContain(
				'"ok": true',
			);
			await expect(fs.readFile(result.markdownPath, "utf8")).resolves.toContain(
				"Status: PASS",
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("reports drift when a profile example misses baseline keys", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-env-keyset-fail-"),
		);
		const baselineRaw = buildEnvExample([
			"GEMINI_API_KEY",
			"OPENUI_TIMEOUT_MS",
		]);
		const driftRaw = buildEnvExample(["GEMINI_API_KEY"]);

		try {
			await Promise.all([
				fs.writeFile(path.join(rootDir, ".env.example"), baselineRaw, "utf8"),
				fs.writeFile(
					path.join(rootDir, ".env.development.example"),
					driftRaw,
					"utf8",
				),
				fs.writeFile(
					path.join(rootDir, ".env.staging.example"),
					baselineRaw,
					"utf8",
				),
				fs.writeFile(
					path.join(rootDir, ".env.production.example"),
					baselineRaw,
					"utf8",
				),
			]);

			const result = await buildKeysetDriftReport({ rootDir });
			expect(result.report.ok).toBe(false);
			expect(result.report.counts.driftTargets).toBe(1);
			const driftTarget = result.report.targets.find(
				(target) => target.file === ".env.development.example",
			);
			expect(driftTarget?.file).toBe(".env.development.example");
			expect(driftTarget?.missing).toContain("OPENUI_TIMEOUT_MS");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
