import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("repo upstream check cli", () => {
	it("chains upstream governance with post-fetch history audit", async () => {
		const script = await readFile(
			path.join(repoRoot, "tooling", "cli", "repo-upstream-check.mjs"),
			"utf8",
		);

		expect(script).toContain('["npm", "run", "-s", "governance:upstream:check"]');
		expect(script).toContain('["npm", "run", "-s", "security:history:audit"]');
		expect(script.indexOf('governance:upstream:check')).toBeLessThan(
			script.indexOf('security:history:audit'),
		);
	});
});
