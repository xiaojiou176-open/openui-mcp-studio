import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGovernanceLanguageBoundaryCheck } from "../tooling/check-governance-language-boundary.mjs";
import { runPublicInfraBoundaryCheck } from "../tooling/check-public-infra-boundary.mjs";

const tempRoots: string[] = [];

async function mkTempRoot(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempRoots.push(dir);
	return dir;
}

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("public boundary allowlist", () => {
	it("allows declared workflow exceptions while still scanning the file", async () => {
		const root = await mkTempRoot("openui-public-boundary-");
		await writeJson(
			path.join(root, "tooling", "contracts", "public-boundary-allowlist.json"),
			{
				version: 1,
				publicInfraBoundary: {
					scanPaths: [".github/workflows/internal.yml"],
					allowedExceptions: [
						{
							path: ".github/workflows/internal.yml",
							ruleIds: ["self-hosted-label", "shared-pool-label"],
							reason: "fixture",
						},
					],
				},
				languageBoundary: {
					scanPaths: ["README.md"],
					allowedNonAsciiPaths: [],
				},
			},
		);
		await writeFile(
			path.join(root, ".github", "workflows", "internal.yml"),
			'runs-on: ["self-hosted", "shared-pool"]\n',
		);
		await writeFile(path.join(root, "README.md"), "# Test\n");

		const result = await runPublicInfraBoundaryCheck({ rootDir: root });

		expect(result.ok).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("fails when a deep-water english boundary file contains non-ascii content", async () => {
		const root = await mkTempRoot("openui-language-boundary-");
		await writeJson(
			path.join(root, "tooling", "contracts", "public-boundary-allowlist.json"),
			{
				version: 1,
				publicInfraBoundary: {
					scanPaths: [],
					allowedExceptions: [],
				},
				languageBoundary: {
					scanPaths: ["README.md", "ops/README.md"],
					allowedNonAsciiPaths: [],
				},
			},
		);
		await writeFile(path.join(root, "README.md"), "# Test\n");
		await writeFile(path.join(root, "ops", "README.md"), "含中文\n");

		const result = await runGovernanceLanguageBoundaryCheck(root);

		expect(result.ok).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.stringContaining("ops/README.md contains non-ASCII content"),
			]),
		);
	});
});
