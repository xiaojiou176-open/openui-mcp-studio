import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPiiAudit } from "../tooling/pii-audit.mjs";

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

describe("pii audit", () => {
	it("passes when tracked files only contain allowlisted example addresses", async () => {
		const root = await mkTempRoot("openui-pii-pass-");
		await writeJson(
			path.join(root, "tooling", "contracts", "pii-audit.contract.json"),
			{
				version: 1,
				reportPath: ".runtime-cache/reports/security/pii-audit.json",
				allowedEmailDomains: ["example.com"],
				allowedEmailAddresses: ["git@github.com"],
				ignoredPathRegexes: [],
			},
		);
		await writeFile(
			path.join(root, "tests", "sample.test.ts"),
			'const email = "ci@example.com";\nconst remote = "git@github.com:owner/repo.git";\n',
		);

		const result = await runPiiAudit({
			rootDir: root,
			contractPath: "tooling/contracts/pii-audit.contract.json",
			trackedFiles: ["tests/sample.test.ts"],
		});

		expect(result.ok).toBe(true);
		expect(result.report.findingCount).toBe(0);
	});

	it("flags non-allowlisted email addresses in tracked files", async () => {
		const root = await mkTempRoot("openui-pii-email-");
		const address = ["terry", "real-company.dev"].join("@");
		await writeJson(
			path.join(root, "tooling", "contracts", "pii-audit.contract.json"),
			{
				version: 1,
				reportPath: ".runtime-cache/reports/security/pii-audit.json",
				allowedEmailDomains: ["example.com"],
				allowedEmailAddresses: [],
				ignoredPathRegexes: [],
			},
		);
		await writeFile(
			path.join(root, "docs", "contact.md"),
			`Reach me at ${address}\n`,
		);

		const result = await runPiiAudit({
			rootDir: root,
			contractPath: "tooling/contracts/pii-audit.contract.json",
			trackedFiles: ["docs/contact.md"],
		});

		expect(result.ok).toBe(false);
		expect(result.report.findings).toEqual([
			{
				detectorId: "email_address",
				file: "docs/contact.md",
				line: 1,
				redactedMatch: "t***@real-company.dev",
			},
		]);
	});

	it("flags phone-like contact fields but ignores unrelated numeric config", async () => {
		const root = await mkTempRoot("openui-pii-phone-");
		const contactKey = ["pho", "ne"].join("");
		const valueParts = ["+", "1", " ", "(206)", " ", "555", "-", "0188"];
		const contactValue = valueParts.join("");
		await writeJson(
			path.join(root, "tooling", "contracts", "pii-audit.contract.json"),
			{
				version: 1,
				reportPath: ".runtime-cache/reports/security/pii-audit.json",
				allowedEmailDomains: ["example.com"],
				allowedEmailAddresses: [],
				ignoredPathRegexes: [],
			},
		);
		await writeJson(path.join(root, "fixtures", "contact.json"), {
			[contactKey]: contactValue,
			cacheMaxBytes: 104857600,
		});

		const result = await runPiiAudit({
			rootDir: root,
			contractPath: "tooling/contracts/pii-audit.contract.json",
			trackedFiles: ["fixtures/contact.json"],
		});

		expect(result.ok).toBe(false);
		expect(result.report.findings).toEqual([
			{
				detectorId: "phone_like_contact_field",
				file: "fixtures/contact.json",
				line: 2,
				redactedMatch: "+1***0188",
			},
		]);
	});
});
