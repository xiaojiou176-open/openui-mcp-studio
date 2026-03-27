import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

async function read(filePath: string): Promise<string> {
	return await fs.readFile(path.join(repoRoot, filePath), "utf8");
}

describe("runtime governance docs parity", () => {
	it("keeps all tracked example env files on the run-scoped log path", async () => {
		const files = [
			".env.example",
			".env.development.example",
			".env.staging.example",
			".env.production.example",
		];

		for (const file of files) {
			const content = await read(file);
			expect(content).toContain(
				"OPENUI_MCP_LOG_DIR=.runtime-cache/runs/<run_id>/logs/runtime.jsonl",
			);
		}
	});

	it("keeps the testing guide aligned with the minimal governance profile", async () => {
		const content = await read("docs/testing.md");
		expect(content).toContain("CI `secret_scan`");
		expect(content).toContain("tracked-surface hygiene");
		expect(content).not.toContain("docs/generated/");
	});
});
