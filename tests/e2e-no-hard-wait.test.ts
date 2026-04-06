import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const E2E_ROOT = path.resolve(process.cwd(), "tests/e2e");
const E2E_TYPESCRIPT_FILE = /\.(?:ts|tsx|mts|cts)$/;
const ALLOWLISTED_INFRA_WAIT_FILES = new Set(["tests/e2e/helpers/server.ts"]);

type HardWaitRule = {
	name: string;
	pattern: RegExp;
};

const HARD_WAIT_RULES: readonly HardWaitRule[] = [
	{
		name: "waitForTimeout",
		pattern: /\bwaitForTimeout\s*\(/,
	},
	{
		name: "setTimeout",
		pattern: /\bsetTimeout\s*\(/,
	},
	{
		name: "new Promise(setTimeout)",
		pattern:
			/new\s+Promise(?:<[^>]*>)?\s*\(\s*(?:async\s*)?\([^)]*\)\s*=>[\s\S]*?\bsetTimeout\s*\(/,
	},
	{
		name: "delay(with-arg)",
		pattern: /\bdelay\s*\(\s*[^)\s][^)]*\)/,
	},
];

async function collectTypescriptFiles(rootDir: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	for (const entry of entries) {
		const absolutePath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectTypescriptFiles(absolutePath)));
			continue;
		}
		if (entry.isFile() && E2E_TYPESCRIPT_FILE.test(entry.name)) {
			files.push(absolutePath);
		}
	}
	return files;
}

function collectHardWaitViolations(
	absolutePath: string,
	content: string,
): string[] {
	const relativePath = path.relative(process.cwd(), absolutePath);
	if (ALLOWLISTED_INFRA_WAIT_FILES.has(relativePath)) {
		return [];
	}
	return HARD_WAIT_RULES.filter((rule) => rule.pattern.test(content)).map(
		(rule) => `${relativePath} (${rule.name})`,
	);
}

describe("e2e hard-wait guard", () => {
	it("detects common hard-wait patterns and preserves infra timeout allowlist", () => {
		const unsafeSnippet = [
			"await page.waitForTimeout(300);",
			"setTimeout(() => cleanup(), 500);",
			"await new Promise((resolve) => setTimeout(resolve, 1_000));",
			"const pauseMs = 200;",
			"await delay(pauseMs);",
			"await delay(pauseMs + 100);",
		].join("\n");
		const safeSnippet = "await page.waitForURL(/ready/);";

		const violations = collectHardWaitViolations(
			path.resolve(process.cwd(), "tests/e2e/sample.spec.ts"),
			unsafeSnippet,
		);
		expect(violations).toEqual([
			"tests/e2e/sample.spec.ts (waitForTimeout)",
			"tests/e2e/sample.spec.ts (setTimeout)",
			"tests/e2e/sample.spec.ts (new Promise(setTimeout))",
			"tests/e2e/sample.spec.ts (delay(with-arg))",
		]);
		expect(
			collectHardWaitViolations(
				path.resolve(process.cwd(), "tests/e2e/safe.spec.ts"),
				safeSnippet,
			),
		).toEqual([]);
		expect(
			collectHardWaitViolations(
				path.resolve(process.cwd(), "tests/e2e/helpers/server.ts"),
				unsafeSnippet,
			),
		).toEqual([]);
	});

	it("rejects hard waits in e2e specs and helpers", async () => {
		const files = await collectTypescriptFiles(E2E_ROOT);
		const violations: string[] = [];

		for (const absolutePath of files) {
			const content = await fs.readFile(absolutePath, "utf8");
			violations.push(...collectHardWaitViolations(absolutePath, content));
		}

		expect(violations).toEqual([]);
	});
});
