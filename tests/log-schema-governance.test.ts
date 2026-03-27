import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runLogSchemaCheck } from "../tooling/check-log-schema.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("log schema governance", () => {
	it("fails when jsonl payload misses required fields", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openui-log-schema-"));
		try {
			await writeJson(
				path.join(rootDir, "contracts", "observability", "log-event.schema.json"),
				{
					version: 2,
					requiredCommonFields: [
						"ts",
						"level",
						"event",
						"runId",
						"traceId",
						"requestId",
						"service",
						"component",
						"stage",
						"context",
					],
				},
			);
			await writeFile(
				path.join(rootDir, "services", "mcp-server", "src", "logger.ts"),
				'const payload = { ts: "", level: "", event: "", runId: "", traceId: "", requestId: "", service: "", component: "", stage: "", context: {} };\nconst x = redactSensitiveMeta;\n',
			);
			await writeFile(
				path.join(rootDir, ".runtime-cache", "runs", "run-123", "logs", "runtime.jsonl"),
				'{"ts":"1","level":"info","event":"missing-trace"}\n',
			);

			const result = await runLogSchemaCheck({
				rootDir,
				logDir: ".runtime-cache/runs",
			});
			expect(result.ok).toBe(false);
			expect(result.errors[0]).toContain('missing required log field "runId"');
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
