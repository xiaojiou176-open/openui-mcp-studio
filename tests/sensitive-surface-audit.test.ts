import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSensitiveSurfaceAudit } from "../tooling/sensitive-surface-audit.mjs";

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

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("sensitive surface audit", () => {
	it("passes allowlisted example identities and placeholder host paths", async () => {
		const root = await mkTempRoot("openui-sensitive-surface-pass-");
		const placeholderChromeRoot = `${MACOS_USER_PREFIX}.../Library/Application Support/Google/Chrome`;
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
				allowedHostPathRegexes: [
					"^\\x2fUsers\\x2f\\.\\.\\.\\x2f",
					"^\\x2fhome\\x2fdev(?:\\x2f.*)?$",
				],
				ignoredPathRegexes: [],
			},
		);
		await writeFile(
			path.join(root, "docs", "sample.md"),
			`Contact: "ci@example.com"\nRemote: "git@github.com:owner/repo.git"\nPlaceholder: "${placeholderChromeRoot}"\n`,
		);

		const result = await runSensitiveSurfaceAudit({
			rootDir: root,
			contractPath: "tooling/contracts/sensitive-surface-audit.contract.json",
			trackedFiles: ["docs/sample.md"],
		});

		expect(result.ok).toBe(true);
		expect(result.report.findingCount).toBe(0);
	});

	it("flags personal email, phone-like contact field, and host path leaks", async () => {
		const root = await mkTempRoot("openui-sensitive-surface-fail-");
		const personalChromeRoot = `${MACOS_USER_PREFIX}real-user/Library/Application Support/Google/Chrome`;
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
				allowedPhoneRegexes: [],
				allowedHostPathRegexes: [],
				ignoredPathRegexes: [],
			},
		);
		await writeFile(
			path.join(root, "docs", "leak.md"),
			[
				'owner = "real.user@personal.dev"',
				'contact = "phone: +1 (206) 444-0188"',
				`root = "${personalChromeRoot}"`,
				"",
			].join("\n"),
		);

		const result = await runSensitiveSurfaceAudit({
			rootDir: root,
			contractPath: "tooling/contracts/sensitive-surface-audit.contract.json",
			trackedFiles: ["docs/leak.md"],
		});

		expect(result.ok).toBe(false);
		expect(result.report.summaryByDetector).toMatchObject({
			email_address: 1,
			phone_like_contact_field: 1,
			macos_user_path: 1,
		});
		expect(
			result.report.findings.map((finding) => finding.redactedMatch),
		).toEqual(
			expect.arrayContaining([
				"r***@personal.dev",
				"+1***0188",
				["/", "Users", "/***"].join(""),
			]),
		);
	});
});
