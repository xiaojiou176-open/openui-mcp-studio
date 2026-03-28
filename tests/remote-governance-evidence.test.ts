import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runRemoteGovernanceEvidenceCheck } from "../tooling/check-remote-governance-evidence.mjs";

const tempRoots: string[] = [];

async function mkTempRoot(prefix: string): Promise<string> {
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

function freshCheckedAt(): string {
	return new Date().toISOString();
}

function makeControl(id: string, status = "verified") {
	return {
		id,
		label: id,
		status,
		summary: `${id} summary`,
		value:
			id === "default_branch"
				? "main"
				: status === "verified"
					? "enabled"
					: "unverified",
		verificationMethod:
			status === "verified" ? undefined : "Manual GitHub settings verification",
		expectedChecks: id === "required_checks_main" ? ["quality"] : undefined,
		evidence: [
			{
				type: "repo_path",
				value: "README.md",
			},
		],
	};
}

describe("remote governance evidence", () => {
	it("passes when all required remote controls are present", async () => {
		const root = await mkTempRoot("openui-remote-gov-pass-");
		await writeFile(path.join(root, "README.md"), "# Test\n");
		await writeJson(
			path.join(
				root,
				"tooling",
				"contracts",
				"remote-governance-evidence.contract.json",
			),
			{
				version: 1,
				repository: {
					owner: "owner",
					name: "repo",
				},
				checkedAt: freshCheckedAt(),
				repoLocalControls: [makeControl("workflow_governance")],
				remotePlatformControls: [
					makeControl("default_branch"),
					makeControl("branch_protection_main", "unverified"),
					makeControl("required_checks_main", "unverified"),
					makeControl("codeowners_enforcement", "unverified"),
					makeControl("secret_scanning", "unverified"),
					makeControl("push_protection", "unverified"),
					makeControl("code_scanning", "unverified"),
					makeControl("private_vulnerability_reporting", "unverified"),
				],
			},
		);

		const result = await runRemoteGovernanceEvidenceCheck({ rootDir: root });

		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it("fails when a required remote control is missing", async () => {
		const root = await mkTempRoot("openui-remote-gov-fail-");
		await writeFile(path.join(root, "README.md"), "# Test\n");
		await writeJson(
			path.join(
				root,
				"tooling",
				"contracts",
				"remote-governance-evidence.contract.json",
			),
			{
				version: 1,
				repository: {
					owner: "owner",
					name: "repo",
				},
				checkedAt: freshCheckedAt(),
				repoLocalControls: [makeControl("workflow_governance")],
				remotePlatformControls: [
					makeControl("default_branch"),
					makeControl("branch_protection_main", "unverified"),
				],
			},
		);

		const result = await runRemoteGovernanceEvidenceCheck({ rootDir: root });

		expect(result.ok).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					'remotePlatformControls is missing required control "required_checks_main"',
				),
			]),
		);
	});

	it("fails when the contract repository drifts from git remote origin identity", async () => {
		const root = await mkTempRoot("openui-remote-gov-origin-drift-");
		await writeFile(path.join(root, "README.md"), "# Test\n");
		await writeJson(
			path.join(
				root,
				"tooling",
				"contracts",
				"remote-governance-evidence.contract.json",
			),
			{
				version: 1,
				repository: {
					owner: "stale-owner",
					name: "stale-repo",
				},
				checkedAt: "2026-03-24T22:17:34Z",
				repoLocalControls: [makeControl("workflow_governance")],
				remotePlatformControls: [
					makeControl("default_branch"),
					makeControl("branch_protection_main", "unverified"),
					makeControl("required_checks_main", "unverified"),
					makeControl("codeowners_enforcement", "unverified"),
					makeControl("secret_scanning", "unverified"),
					makeControl("push_protection", "unverified"),
					makeControl("code_scanning", "unverified"),
					makeControl("private_vulnerability_reporting", "unverified"),
				],
			},
		);

		const result = await runRemoteGovernanceEvidenceCheck({
			rootDir: root,
			originUrl: "git@github.com:current-owner/current-repo.git",
		});

		expect(result.ok).toBe(false);
		expect(
			result.errors.some((entry) =>
				entry.includes("repository owner/name must match git remote origin"),
			),
		).toBe(true);
	});

	it("fails strict mode when repository is private and controls are not public-ready", async () => {
		const root = await mkTempRoot("openui-remote-gov-strict-fail-");
		await writeFile(path.join(root, "README.md"), "# Test\n");
		await writeJson(
			path.join(
				root,
				"tooling",
				"contracts",
				"remote-governance-evidence.contract.json",
			),
			{
				version: 1,
				repository: {
					owner: "owner",
					name: "repo",
					visibility: "private",
				},
				checkedAt: freshCheckedAt(),
				repoLocalControls: [makeControl("workflow_governance")],
				remotePlatformControls: [
					makeControl("default_branch"),
					makeControl("branch_protection_main"),
					makeControl("required_checks_main"),
					makeControl("codeowners_enforcement"),
					makeControl("secret_scanning"),
					makeControl("push_protection"),
					makeControl("code_scanning"),
					makeControl("private_vulnerability_reporting"),
				],
			},
		);

		const result = await runRemoteGovernanceEvidenceCheck({
			rootDir: root,
			strict: true,
		});

		expect(result.ok).toBe(false);
		expect(
			result.errors.some((entry) =>
				entry.includes('repository.visibility to equal "public"'),
			),
		).toBe(true);
		expect(
			result.errors.some((entry) =>
				entry.includes('"required_checks_main" value'),
			),
		).toBe(true);
	});

	it("passes strict mode when repository is public and remote controls have public-ready values", async () => {
		const root = await mkTempRoot("openui-remote-gov-strict-pass-");
		await writeFile(path.join(root, "README.md"), "# Test\n");
		await writeJson(
			path.join(
				root,
				"tooling",
				"contracts",
				"remote-governance-evidence.contract.json",
			),
			{
				version: 1,
				repository: {
					owner: "owner",
					name: "repo",
					visibility: "public",
				},
				checkedAt: freshCheckedAt(),
				repoLocalControls: [makeControl("workflow_governance")],
				publicReadyRequirements: {
					requiredValues: {
						branch_protection_main: ["enabled"],
						required_checks_main: ["enforced"],
						codeowners_enforcement: ["enforced"],
						secret_scanning: ["enabled"],
						push_protection: ["enabled"],
						code_scanning: ["enabled"],
						private_vulnerability_reporting: ["enabled"],
					},
				},
				remotePlatformControls: [
					makeControl("default_branch"),
					{
						...makeControl("branch_protection_main"),
						value: "enabled",
					},
					{
						...makeControl("required_checks_main"),
						value: "enforced",
					},
					{
						...makeControl("codeowners_enforcement"),
						value: "enforced",
					},
					{
						...makeControl("secret_scanning"),
						value: "enabled",
					},
					{
						...makeControl("push_protection"),
						value: "enabled",
					},
					{
						...makeControl("code_scanning"),
						value: "enabled",
					},
					{
						...makeControl("private_vulnerability_reporting"),
						value: "enabled",
					},
				],
			},
		);

		const result = await runRemoteGovernanceEvidenceCheck({
			rootDir: root,
			strict: true,
		});

		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
	});
});
