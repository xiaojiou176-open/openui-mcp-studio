import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyReleaseReadiness } from "../tooling/check-release-readiness.mjs";

const tempRoots: string[] = [];
const ORIGINAL_RUNTIME_RUN_ID = process.env.OPENUI_RUNTIME_RUN_ID;
const ORIGINAL_CI_GATE_RUN_KEY = process.env.OPENUI_CI_GATE_RUN_KEY;

async function mkTempRoot(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempRoots.push(dir);
	return dir;
}

async function copyFileIntoTemp(rootDir: string, relativePath: string) {
	const content = await fs.readFile(relativePath, "utf8");
	const targetPath = path.join(rootDir, relativePath);
	await fs.mkdir(path.dirname(targetPath), { recursive: true });
	await fs.writeFile(targetPath, content, "utf8");
}

afterEach(async () => {
	if (ORIGINAL_RUNTIME_RUN_ID === undefined) {
		delete process.env.OPENUI_RUNTIME_RUN_ID;
	} else {
		process.env.OPENUI_RUNTIME_RUN_ID = ORIGINAL_RUNTIME_RUN_ID;
	}
	if (ORIGINAL_CI_GATE_RUN_KEY === undefined) {
		delete process.env.OPENUI_CI_GATE_RUN_KEY;
	} else {
		process.env.OPENUI_CI_GATE_RUN_KEY = ORIGINAL_CI_GATE_RUN_KEY;
	}
	await Promise.all(
		tempRoots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("release readiness contract check", () => {
	it("passes when CI image lock contains an immutable digest and contract evidence is wired", async () => {
		const result = await verifyReleaseReadiness({
			rootDir: process.cwd(),
			listTags: () => ["v0.3.0"],
		});

		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.latestTag).toBe("v0.3.0");
	});

	it("fails in strict mode when no authoritative run evidence is present", async () => {
		delete process.env.OPENUI_RUNTIME_RUN_ID;
		delete process.env.OPENUI_CI_GATE_RUN_KEY;
		const rootDir = await mkTempRoot("openui-release-readiness-strict-");
		for (const relativePath of [
			"tooling/contracts/release-readiness.contract.json",
			"contracts/governance/evidence-schema.json",
			"contracts/runtime/run-layout.json",
			".github/ci-image.lock.json",
			"docs/contracts/openui-mcp.openapi.json",
			"docs/contracts/performance-budget.json",
			"docs/contracts/rum-slo.json",
			"docs/contracts/feature-flags.json",
			"docs/contracts/canary-policy.json",
			"docs/contracts/rollback-policy.json",
			"docs/contracts/observability-policy.json",
			"docs/contracts/ci-image-supply-chain.json",
			"contracts/observability/log-event.schema.json",
		]) {
			await copyFileIntoTemp(rootDir, relativePath);
		}

		const result = await verifyReleaseReadiness({
			rootDir,
			listTags: () => ["v0.3.0"],
			requireAuthoritativeRuns: true,
		});

		expect(result.ok).toBe(false);
		expect(
			result.errors.some((issue) =>
				issue.includes("authoritativeEvidence: No authoritative runs are present"),
			),
		).toBe(true);
		expect(
			result.errors.some((issue) =>
				issue.includes("authoritativeRunCorrelation: No authoritative runs are present"),
			),
		).toBe(true);
	});

	it("fails when release tags are missing", async () => {
		const result = await verifyReleaseReadiness({
			rootDir: process.cwd(),
			listTags: () => [],
		});

		expect(result.ok).toBe(false);
		expect(
			result.errors.some((issue) =>
				issue.toLowerCase().includes("git release tag"),
			),
			).toBe(true);
		});

	it("does not report CI image supply-chain errors when digest and evidence contract are valid", async () => {
		const result = await verifyReleaseReadiness({
			rootDir: process.cwd(),
			listTags: () => ["v0.3.0"],
		});

		expect(
			result.errors.some((issue) =>
				issue.toLowerCase().includes("ciimagesupplychain"),
			),
		).toBe(false);
	});

	it("does not report observability policy shape errors when the policy source is wired correctly", async () => {
		const result = await verifyReleaseReadiness({
			rootDir: process.cwd(),
			listTags: () => ["v0.3.0"],
		});

		expect(
			result.errors.some((issue) =>
				issue.toLowerCase().includes("observabilitypolicy"),
			),
		).toBe(false);
	});
});
