import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

async function readFile(relativePath: string) {
	return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

describe("oss security audit contract", () => {
	it("keeps package scripts wired to the repository-local OSS audit entrypoints", async () => {
		const packageJson = JSON.parse(await readFile("package.json")) as {
			scripts?: Record<string, string>;
		};

		expect(packageJson.scripts).toMatchObject({
			"security:history:audit": "bash tooling/history-secrets-audit.sh",
			"security:trufflehog:audit": "bash tooling/trufflehog-audit.sh",
			"security:git-secrets:history":
				"bash tooling/git-secrets-history-audit.sh",
			"security:scancode:keyfiles":
				"bash tooling/scancode-keyfiles-audit.sh",
			"security:oss:audit": "bash tooling/oss-security-audit.sh",
		});
	});

	it("keeps trufflehog exclusions aligned with repo-local noise surfaces", async () => {
		const content = await readFile("tooling/trufflehog-exclude.txt");

		expect(content).toContain("^node_modules/");
		expect(content).toContain("^\\.env$");
		expect(content).toContain("^apps/web/node_modules/");
		expect(content).toContain("^apps/web/.next/");
		expect(content).toContain("^\\.runtime-cache/");
	});

	it("documents the OSS audit bundle in public-facing governance docs", async () => {
		const readme = await readFile("README.md");
		const runbook = await readFile("docs/governance-runbook.md");
		const security = await readFile("SECURITY.md");

		expect(readme).toContain("npm run security:oss:audit");
		expect(runbook).toContain("npm run security:oss:audit");
		expect(security).toContain("npm run security:oss:audit");
	});

	it("keeps the live secret doc line documented without requiring a tracked secrets baseline", async () => {
		const testingGuide = await readFile("docs/testing.md");

		expect(testingGuide).toContain(
			"Minimum live runtime secret: `GEMINI_API_KEY` <!-- pragma: allowlist secret -->",
		);
	});
});
