import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGithubSensitiveSurfaceReview } from "../tooling/github-sensitive-surface-review.mjs";

const tempRoots: string[] = [];
const GMAIL_QUERY = ["@", "g", "mail.com"].join("");

async function mkTempRoot(prefix: string) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempRoots.push(dir);
	return dir;
}

async function writeJson(filePath: string, value: unknown) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("github sensitive surface review", () => {
	it("passes when GitHub public surfaces and pull refs are clean", async () => {
		const root = await mkTempRoot("openui-gh-sensitive-pass-");
		await writeJson(
			path.join(
				root,
				"tooling",
				"contracts",
				"sensitive-surface-audit.contract.json",
			),
			{
				version: 1,
				reportPath:
					".runtime-cache/reports/security/sensitive-surface-audit.json",
				historyReportPath:
					".runtime-cache/reports/security/history-sensitive-surface-audit.json",
				allowedEmailDomains: ["example.com"],
				allowedEmailAddresses: ["git@github.com"],
				allowedPhoneRegexes: [],
				allowedHostPathRegexes: ["^\\x2fUsers\\x2f\\.\\.\\.\\x2f"],
				ignoredPathRegexes: [],
			},
		);

		const ghJsonRunner = async (args) => {
			const command = args.join(" ");
			if (command.includes("secret-scanning/alerts")) {
				return [];
			}
			if (command.includes("code-scanning/alerts")) {
				return [];
			}
			if (command.includes("search code")) {
				return [];
			}
			if (command.includes("issues/comments")) {
				return [];
			}
			if (command.includes("pulls/comments")) {
				return [];
			}
			return [];
		};

		const result = await runGithubSensitiveSurfaceReview({
			rootDir: root,
			repository: { owner: "example", name: "demo" },
			ghJsonRunner,
			mirrorAuditRunner: async () => ({
				mainTagFindings: [],
				pullRefFindings: [],
				pullRefCount: 2,
			}),
		});

		expect(result.ok).toBe(true);
		expect(result.report.remoteRefs.pullRefCount).toBe(2);
		expect(result.report.codeScanning.openAlertCount).toBe(0);
		expect(result.report.codeSearch.totalFindings).toBe(0);
	});

	it("fails when GitHub code scanning or pull refs still expose sensitive surfaces", async () => {
		const root = await mkTempRoot("openui-gh-sensitive-fail-");
		await writeJson(
			path.join(
				root,
				"tooling",
				"contracts",
				"sensitive-surface-audit.contract.json",
			),
			{
				version: 1,
				reportPath:
					".runtime-cache/reports/security/sensitive-surface-audit.json",
				historyReportPath:
					".runtime-cache/reports/security/history-sensitive-surface-audit.json",
				allowedEmailDomains: ["example.com"],
				allowedEmailAddresses: ["git@github.com"],
				allowedPhoneRegexes: [],
				allowedHostPathRegexes: [],
				ignoredPathRegexes: [],
			},
		);

		const ghJsonRunner = async (args) => {
			const command = args.join(" ");
			if (command.includes("secret-scanning/alerts")) {
				return [];
			}
			if (command.includes("code-scanning/alerts")) {
				return [{ number: 1 }];
			}
			if (command.includes(`search code ${GMAIL_QUERY}`)) {
				return [{ path: "tests/local-chrome-profile.test.ts" }];
			}
			if (command.includes("search code")) {
				return [];
			}
			return [];
		};

		const result = await runGithubSensitiveSurfaceReview({
			rootDir: root,
			repository: { owner: "example", name: "demo" },
			ghJsonRunner,
			mirrorAuditRunner: async () => ({
				mainTagFindings: [],
				pullRefFindings: [
					{
						detectorId: "email_address",
						commit: "abc",
						file: "tests/local-chrome-profile.test.ts",
						line: 110,
						redactedMatch: ["x***", GMAIL_QUERY].join(""),
						surface: "remote_pull_refs",
					},
				],
				pullRefCount: 16,
			}),
		});

		expect(result.ok).toBe(false);
		expect(result.report.codeScanning.openAlertCount).toBe(1);
		expect(result.report.codeSearch.totalFindings).toBe(0);
		expect(result.report.remoteRefs.pullRefFindingCount).toBe(1);
		expect(result.report.notes).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Code search was skipped"),
			]),
		);
	});

	it("passes when GitHub code search is rate-limited but primary alert surfaces are clean", async () => {
		const root = await mkTempRoot("openui-gh-sensitive-rate-limit-");
		await writeJson(
			path.join(
				root,
				"tooling",
				"contracts",
				"sensitive-surface-audit.contract.json",
			),
			{
				version: 1,
				reportPath:
					".runtime-cache/reports/security/sensitive-surface-audit.json",
				historyReportPath:
					".runtime-cache/reports/security/history-sensitive-surface-audit.json",
				allowedEmailDomains: ["example.com"],
				allowedEmailAddresses: ["git@github.com"],
				allowedPhoneRegexes: [],
				allowedHostPathRegexes: [],
				ignoredPathRegexes: [],
			},
		);

		const ghJsonRunner = async (args) => {
			const command = args.join(" ");
			if (command.includes("secret-scanning/alerts")) {
				return [];
			}
			if (command.includes("code-scanning/alerts")) {
				return [];
			}
			if (command.includes("search code")) {
				throw new Error(
					`Command failed: gh search code '${GMAIL_QUERY} repo:example/demo' --limit 20 --json path\nHTTP 403: API rate limit exceeded (https://api.github.com/search/code?page=1)`,
				);
			}
			if (command.includes("issues/comments")) {
				return [];
			}
			if (command.includes("pulls/comments")) {
				return [];
			}
			return [];
		};

		const result = await runGithubSensitiveSurfaceReview({
			rootDir: root,
			repository: { owner: "example", name: "demo" },
			ghJsonRunner,
			mirrorAuditRunner: async () => ({
				mainTagFindings: [],
				pullRefFindings: [],
				pullRefCount: 0,
			}),
		});

		expect(result.ok).toBe(true);
		expect(result.report.codeSearch.totalFindings).toBe(0);
		expect(result.report.notes).toEqual(
			expect.arrayContaining([expect.stringContaining("rate limit")]),
		);
	});
});
