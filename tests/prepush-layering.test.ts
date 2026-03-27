import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("pre-push layering", () => {
	it("hooks pre-push to strict prepush gate script", async () => {
		const hookPath = path.join(repoRoot, ".githooks/pre-push");
		const hook = await fs.readFile(hookPath, "utf8");

		expect(hook).toContain("npm run -s prepush:gate");
		expect(hook).toContain("running strict local gate");
		expect(hook).not.toContain("npm run -s test");
	});

	it("defines prepush:gate as strict precommit gate only", async () => {
		const packageJsonPath = path.join(repoRoot, "package.json");
		const packageJsonText = await fs.readFile(packageJsonPath, "utf8");
		const parsed = JSON.parse(packageJsonText) as {
			scripts?: Record<string, string>;
		};
		const prepushGate = parsed.scripts?.["prepush:gate"] ?? "";

		expect(prepushGate).toContain("precommit:gate");
		expect(prepushGate).toContain("prepush-light");
		expect(prepushGate).not.toContain("test:acceptance:gate");
	});

	it("raises the prepush uiux timeout floor to absorb slow live audits", async () => {
		const scriptPath = path.join(repoRoot, "tooling/run-prepush-uiux-gate.mjs");
		const script = await fs.readFile(scriptPath, "utf8");

		expect(script).toContain("PREPUSH_UIUX_TIMEOUT_MS_FLOOR = 180_000");
		expect(script).toContain("OPENUI_TIMEOUT_MS: String(effectiveTimeoutMs)");
	});
});
