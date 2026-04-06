import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("env inventory", () => {
	it("includes every non-contract key from deprecation registry", async () => {
		const { stdout } = await execFileAsync(
			process.execPath,
			["tooling/env-inventory.mjs"],
			{
				cwd: process.cwd(),
				env: {
					...process.env,
				},
			},
		);

		const payload = JSON.parse(stdout) as {
			nonContractVars: string[];
		};
		const registryRaw = await fs.readFile(
			path.join(
				process.cwd(),
				"tooling",
				"env-contract",
				"deprecation-registry.json",
			),
			"utf8",
		);
		const registry = JSON.parse(registryRaw) as {
			nonContractKeys?: Array<{ key: string }>;
		};
		const registryKeys = (registry.nonContractKeys ?? []).map(
			(entry) => entry.key,
		);

		for (const key of registryKeys) {
			expect(payload.nonContractVars).toContain(key);
		}
	}, 15_000);
});
