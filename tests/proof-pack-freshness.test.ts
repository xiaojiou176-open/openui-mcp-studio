import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runProofPackFreshnessCheck } from "../tooling/check-proof-pack-freshness.mjs";

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

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("proof pack freshness", () => {
	it("passes when minimal proof-route docs and scripts exist", async () => {
		const root = await mkTempRoot("openui-proof-pass-");
		await writeFile(
			path.join(root, "package.json"),
			JSON.stringify(
				{
					scripts: {
						"repo:doctor": "echo ok",
						"release:public-safe:check": "echo ok",
						"governance:remote-evidence:check:strict": "echo ok",
						"governance:history-hygiene:check": "echo ok",
						"security:history:audit": "echo ok",
						"security:github:public:audit": "echo ok",
						"security:oss:audit": "echo ok",
						"security:pii:audit": "echo ok",
						"public:assets:check": "echo ok",
						"public:assets:render": "echo ok",
						"public:remote:check": "echo ok",
						"public:surface:check": "echo ok",
					},
				},
				null,
				2,
			),
		);
		await writeFile(
			path.join(root, "README.md"),
			"npm run release:public-safe:check\nnpm run repo:doctor\n",
		);
		await writeFile(
			path.join(root, "docs/index.md"),
			"npm run release:public-safe:check\nnpm run repo:doctor\n",
		);
		await writeFile(
			path.join(root, "docs/release-readiness.md"),
			"npm run governance:remote-evidence:check:strict\nnpm run governance:history-hygiene:check\nnpm run security:github:public:audit\n",
		);
		await writeFile(
			path.join(root, "docs/secrets-incident-runbook.md"),
			"npm run security:history:audit\nnpm run security:oss:audit\nnpm run security:pii:audit\nnpm run security:github:public:audit\n",
		);
		for (const asset of [
			"openui-mcp-studio-workbench.png",
			"openui-mcp-studio-demo.gif",
			"openui-mcp-studio-social-preview.png",
			"openui-mcp-studio-workflow-overview.png",
			"openui-mcp-studio-comparison.png",
			"openui-mcp-studio-trust-stack.png",
			"openui-mcp-studio-use-cases.png",
			"openui-mcp-studio-visitor-paths.png",
		]) {
			await writeFile(path.join(root, "docs/assets", asset), "placeholder");
		}

		const result = await runProofPackFreshnessCheck(root);

		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
	});
});
