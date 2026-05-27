import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHistoryHygieneCheck } from "../tooling/check-history-hygiene.mjs";

const tempRoots: string[] = [];

async function mkTempRoot(prefix: string) {
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

describe("history hygiene check", () => {
	it("passes when the current history report is zero-findings clean", async () => {
		const root = await mkTempRoot("openui-history-hygiene-zero-");
		await writeJson(
			path.join(root, "tooling", "contracts", "history-hygiene.contract.json"),
			{
				version: 1,
				reportPath:
					".runtime-cache/reports/history-audit/gitleaks-history.json",
				summaryExpectation: {
					totalFindings: 0,
					byRule: {},
				},
				classifications: [],
			},
		);
		await writeJson(
			path.join(
				root,
				".runtime-cache",
				"reports",
				"history-audit",
				"gitleaks-history.json",
			),
			[],
		);

		const result = await runHistoryHygieneCheck({ rootDir: root });

		expect(result.ok).toBe(true);
		expect(result.summary).toEqual({
			totalFindings: 0,
			byRule: {},
			classifiedFindings: 0,
			unclassifiedFindings: 0,
		});
	});

	it("passes when the gitleaks history report is fully classified by family", async () => {
		const root = await mkTempRoot("openui-history-hygiene-pass-");
		await writeJson(
			path.join(root, "tooling", "contracts", "history-hygiene.contract.json"),
			{
				version: 1,
				reportPath:
					".runtime-cache/reports/history-audit/gitleaks-history.json",
				summaryExpectation: {
					totalFindings: 3,
					byRule: {
						"generic-api-key": 3,
					},
				},
				classifications: [
					{
						id: "source",
						ruleId: "generic-api-key",
						match: {
							file: "frontend/src/lib/html.ts",
						},
						expectedCount: 1,
						summary: "source",
						evidence: ["git show source"],
					},
					{
						id: "dist",
						ruleId: "generic-api-key",
						match: {
							fileRegex: "^backend/openui/dist/assets/index-.*\\.js$",
						},
						expectedCount: 2,
						summary: "dist",
						evidence: ["git show dist"],
					},
				],
			},
		);
		await writeJson(
			path.join(
				root,
				".runtime-cache",
				"reports",
				"history-audit",
				"gitleaks-history.json",
			),
			[
				{
					RuleID: "generic-api-key",
					File: "frontend/src/lib/html.ts",
					Commit: "abc",
				},
				{
					RuleID: "generic-api-key",
					File: "backend/openui/dist/assets/index-a.js",
					Commit: "def",
				},
				{
					RuleID: "generic-api-key",
					File: "backend/openui/dist/assets/index-b.js",
					Commit: "ghi",
				},
			],
		);

		const result = await runHistoryHygieneCheck({ rootDir: root });

		expect(result.ok).toBe(true);
		expect(result.summary).toEqual({
			totalFindings: 3,
			byRule: {
				"generic-api-key": 3,
			},
			classifiedFindings: 3,
			unclassifiedFindings: 0,
		});
	});

	it("fails when the report contains unclassified findings", async () => {
		const root = await mkTempRoot("openui-history-hygiene-fail-");
		await writeJson(
			path.join(root, "tooling", "contracts", "history-hygiene.contract.json"),
			{
				version: 1,
				reportPath:
					".runtime-cache/reports/history-audit/gitleaks-history.json",
				summaryExpectation: {
					totalFindings: 1,
					byRule: {
						"generic-api-key": 1,
					},
				},
				classifications: [
					{
						id: "source",
						ruleId: "generic-api-key",
						match: {
							file: "frontend/src/lib/html.ts",
						},
						expectedCount: 1,
						summary: "source",
						evidence: ["git show source"],
					},
				],
			},
		);
		await writeJson(
			path.join(
				root,
				".runtime-cache",
				"reports",
				"history-audit",
				"gitleaks-history.json",
			),
			[
				{
					RuleID: "generic-api-key",
					File: "backend/openui/dist/assets/index-a.js",
					Commit: "def",
				},
			],
		);

		const result = await runHistoryHygieneCheck({ rootDir: root });

		expect(result.ok).toBe(false);
		expect(
			result.errors.some((entry) => entry.includes("unclassified findings")),
		).toBe(true);
	});
});
