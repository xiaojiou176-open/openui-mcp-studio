import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function readRepoFile(relativePath: string): Promise<string> {
	return fs.readFile(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("default target contracts for apps/web-first workflows", () => {
	it("smoke CLI defaults to apps/web and removes compat fixture escape hatch", async () => {
		const source = await readRepoFile("tooling/run-next-smoke.ts");
		expect(source).toContain('const DEFAULT_APP_TARGET_ROOT = "apps/web"');
		expect(source).toContain('targetSource: "default"');
		expect(source).not.toContain("fallbackRoot?:");
		expect(source).not.toContain('targetSource: "compat"');
		expect(source).not.toContain("COMPAT_FIXTURE_ROOT");
	});

	it("uiux audit script defaults to apps/web and removes compat fixture option", async () => {
		const source = await readRepoFile("tooling/uiux-ai-audit.ts");
		expect(source).toContain('const DEFAULT_AUDIT_TARGET_ROOT = "apps/web"');
		expect(source).not.toContain("compatFixture");
		expect(source).toContain("resolveTargetRoot(options)");
	});

	it("uiux a11y engine script defaults to apps/web and removes compat fixture option", async () => {
		const source = await readRepoFile("tooling/uiux-a11y-engine.ts");
		expect(source).toContain('const DEFAULT_A11Y_TARGET_ROOT = "apps/web"');
		expect(source).not.toContain("compatFixture");
		expect(source).not.toContain("strict fallback");
		expect(source).toContain("resolveTargetRoot(options)");
	});

	it("playwright e2e helper defaults to apps/web without compat fixture override", async () => {
		const source = await readRepoFile("tests/e2e/helpers/server.ts");
		expect(source).toContain('"apps", "web"');
		expect(source).toContain("resolveAppRoot");
		expect(source).toContain("getTargetBuildManifestStatus");
		expect(source).toContain("args: [");
		expect(source).toContain('"prepare:next-app"');
		expect(source).toContain('"--target-root"');
		expect(source).not.toContain("compatFixture");
	});
});
