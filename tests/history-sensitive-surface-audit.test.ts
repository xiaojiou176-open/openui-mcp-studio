import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runHistorySensitiveSurfaceAudit } from "../tooling/history-sensitive-surface-audit.mjs";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];
const MACOS_USER_PREFIX = ["/", "Users", "/"].join("");

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

async function git(cwd: string, args: string[]) {
	await execFileAsync("git", args, { cwd });
}

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("history sensitive surface audit", () => {
	it("passes when heads and tags only contain allowlisted placeholders", async () => {
		const root = await mkTempRoot("openui-history-sensitive-pass-");
		const placeholderChromeRoot = `${MACOS_USER_PREFIX}.../Library/Application Support/Google/Chrome`;
		await git(root, ["init"]);
		await git(root, ["config", "user.email", "ci@example.com"]);
		await git(root, ["config", "user.name", "ci"]);
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
				allowedHostPathRegexes: ["^\\x2fUsers\\x2f\\.\\.\\.\\x2f"],
				ignoredPathRegexes: [],
			},
		);
		await writeFile(
			path.join(root, "docs", "guide.md"),
			`remote = "git@github.com:owner/repo.git"\nplaceholder = "${placeholderChromeRoot}"\n`,
		);
		await git(root, ["add", "."]);
		await git(root, ["commit", "-m", "safe"]);
		await git(root, ["tag", "v0.0.1"]);

		const result = await runHistorySensitiveSurfaceAudit({
			rootDir: root,
			contractPath: "tooling/contracts/sensitive-surface-audit.contract.json",
		});

		expect(result.ok).toBe(true);
		expect(result.report.findingCount).toBe(0);
	});

	it("fails when local heads or tags still retain personal email or host path residue", async () => {
		const root = await mkTempRoot("openui-history-sensitive-fail-");
		const personalChromeRoot = `${MACOS_USER_PREFIX}real-user/Library/Application Support/Google/Chrome`;
		await git(root, ["init"]);
		await git(root, ["config", "user.email", "ci@example.com"]);
		await git(root, ["config", "user.name", "ci"]);
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
				allowedEmailAddresses: [],
				allowedHostPathRegexes: [],
				ignoredPathRegexes: [],
			},
		);
		await writeFile(
			path.join(root, "docs", "guide.md"),
			`owner = "real.user@personal.dev"\npath = "${personalChromeRoot}"\n`,
		);
		await git(root, ["add", "."]);
		await git(root, ["commit", "-m", "bad history"]);
		await git(root, ["tag", "v0.0.1"]);
		await writeFile(
			path.join(root, "docs", "guide.md"),
			'owner = "redacted@example.com"\n',
		);
		await git(root, ["add", "docs/guide.md"]);
		await git(root, ["commit", "-m", "sanitize head only"]);

		const result = await runHistorySensitiveSurfaceAudit({
			rootDir: root,
			contractPath: "tooling/contracts/sensitive-surface-audit.contract.json",
		});

		expect(result.ok).toBe(false);
		expect(result.report.summaryByDetector).toMatchObject({
			email_address: 1,
			macos_user_path: 1,
		});
		expect(
			result.report.findings.every(
				(finding) => typeof finding.commit === "string",
			),
		).toBe(true);
	});
});
