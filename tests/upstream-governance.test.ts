import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runUpstreamGovernanceCheck } from "../tooling/check-upstream-governance.mjs";
import { printDryRun } from "../tooling/sync-upstream-dryrun.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeAdoptionBacklog(rootDir: string, entries: unknown[]) {
	await writeJson(
		path.join(rootDir, "contracts", "upstream", "adoption-backlog.json"),
		{
			version: 1,
			entries,
		},
	);
}

describe("upstream governance", () => {
	it("fails when required upstream inventory items are missing", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-upstream-"),
		);
		try {
			await writeJson(path.join(rootDir, "package.json"), {
				name: "test",
				devDependencies: { "patch-package": "^8.0.1" },
			});
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "inventory.json"),
				{
					version: 2,
					upstreams: [
						{
							id: "gemini-api",
							sourceLocator: "https://ai.google.dev",
							publicContractSurface: "Gemini API",
							supportedVersionWindow: "env contract",
							pin: { required: true, mode: "env" },
							validationSuites: ["test:live"],
							rollbackPath: "restore env",
						},
					],
				},
			);
			await writeJson(
				path.join(
					rootDir,
					"contracts",
					"upstream",
					"compatibility-matrix.json",
				),
				{ version: 1, entries: [] },
			);
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "patch-registry.json"),
				{ version: 1, manager: "patch-package", patches: [] },
			);
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "glue-surfaces.json"),
				{ version: 1, surfaces: [] },
			);
			await writeAdoptionBacklog(rootDir, [
				{
					id: "openui-upstream-monthly-review",
					inventoryId: "openui-upstream-reference",
					title: "Review upstream OpenUI changes for selective port candidates",
					priority: "P1",
					status: "planned",
					adoptionShape: "selective-port",
					sourceEvidence: "upstream review",
					whyNow: "test fixture",
					localSurfaces: ["contracts/upstream"],
					validationCommands: ["npm run repo:upstream:check"],
					rollbackPath: "revert fixture",
					owner: "devinfra",
				},
			]);

			const result = await runUpstreamGovernanceCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.errors).toEqual(
				expect.arrayContaining([
					expect.stringContaining('missing required upstream "ghcr-ci-image"'),
					expect.stringContaining(
						'missing required upstream "playwright-browser-assets"',
					),
				]),
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails when adoption backlog is missing the upstream reference surface", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-upstream-backlog-"),
		);
		try {
			await writeJson(path.join(rootDir, "package.json"), {
				name: "test",
				devDependencies: { "patch-package": "^8.0.1" },
			});
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "inventory.json"),
				{
					version: 2,
					upstreams: [
						{
							id: "gemini-api",
							glueSurfaceId: "gemini-runtime",
							sourceLocator: "https://ai.google.dev",
							publicContractSurface: "Gemini API",
							supportedVersionWindow: "env contract",
							pin: { required: true, mode: "env" },
							validationSuites: ["test:live"],
							rollbackPath: "restore env",
						},
						{
							id: "ghcr-ci-image",
							glueSurfaceId: "ci-image-runner",
							sourceLocator: ".github/ci-image.lock.json",
							publicContractSurface: "CI image digest",
							supportedVersionWindow: "digest",
							pin: { required: true, mode: "digest" },
							validationSuites: ["governance:pinned-source:check"],
							rollbackPath: "restore lock",
						},
						{
							id: "playwright-browser-assets",
							glueSurfaceId: "playwright-browser-runtime",
							sourceLocator: "package-lock.json",
							publicContractSurface: "playwright package",
							supportedVersionWindow: "lockfile",
							pin: { required: true, mode: "lockfile" },
							validationSuites: ["test:e2e"],
							rollbackPath: "restore lock",
						},
						{
							id: "python-sidecar-dependencies",
							glueSurfaceId: "python-sidecar-runtime",
							sourceLocator: "services/gemini-sidecar/requirements.txt",
							publicContractSurface: "python sidecar deps",
							supportedVersionWindow: "requirements",
							pin: { required: true, mode: "requirements-file" },
							validationSuites: ["py:smoke"],
							rollbackPath: "restore requirements",
						},
						{
							id: "patch-package-surface",
							glueSurfaceId: "patch-replay-layer",
							sourceLocator: "patches",
							publicContractSurface: "patch package",
							supportedVersionWindow: "patch registry",
							pin: { required: true, mode: "patch-registry" },
							validationSuites: ["governance:upstream:check"],
							rollbackPath: "restore patches",
						},
						{
							id: "upstream-sync-remotes",
							glueSurfaceId: "upstream-sync-git-remote",
							sourceLocator: "tooling/sync-upstream-init.mjs",
							publicContractSurface: "upstream remote",
							supportedVersionWindow: "canonical remote",
							pin: { required: true, mode: "commit-sha" },
							validationSuites: ["sync:upstream:check"],
							rollbackPath: "restore remote",
						},
						{
							id: "openui-upstream-reference",
							glueSurfaceId: "openui-upstream-reference",
							sourceLocator: "https://github.com/wandb/openui.git",
							publicContractSurface: "upstream repository",
							supportedVersionWindow: "reviewed commit",
							pin: { required: true, mode: "upstream-remote" },
							validationSuites: ["sync:upstream:check"],
							rollbackPath: "restore evidence",
						},
					],
				},
			);
			await writeJson(
				path.join(
					rootDir,
					"contracts",
					"upstream",
					"compatibility-matrix.json",
				),
				{ version: 1, entries: [] },
			);
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "patch-registry.json"),
				{ version: 1, manager: "patch-package", patches: [] },
			);
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "glue-surfaces.json"),
				{
					version: 1,
					surfaces: [
						{ id: "gemini-runtime" },
						{ id: "ci-image-runner" },
						{ id: "playwright-browser-runtime" },
						{ id: "python-sidecar-runtime" },
						{ id: "patch-replay-layer" },
						{ id: "upstream-sync-git-remote" },
						{ id: "openui-upstream-reference" },
					],
				},
			);
			await writeFile(
				path.join(rootDir, ".github", "ci-image.lock.json"),
				"{}\n",
			);
			await writeFile(path.join(rootDir, "package-lock.json"), "{}\n");
			await writeFile(
				path.join(rootDir, "services", "gemini-sidecar", "requirements.txt"),
				"google-genai>=1.0.0,<2.0.0\n",
			);
			await writeFile(
				path.join(rootDir, "tooling", "sync-upstream-init.mjs"),
				"export {};\n",
			);
			await writeAdoptionBacklog(rootDir, [
				{
					id: "gemini-runtime-review",
					inventoryId: "gemini-api",
					title: "Review Gemini runtime change",
					priority: "P2",
					status: "planned",
					adoptionShape: "defer",
					sourceEvidence: "fixture",
					whyNow: "fixture coverage",
					localSurfaces: ["services/gemini-sidecar/requirements.txt"],
					validationCommands: ["npm run repo:upstream:check"],
					rollbackPath: "revert fixture",
					owner: "openui-platform",
				},
			]);

			const result = await runUpstreamGovernanceCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.errors).toEqual(
				expect.arrayContaining([
					expect.stringContaining(
						'adoption backlog must include at least one entry for "openui-upstream-reference"',
					),
				]),
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails when a done backlog entry is missing required receipt fields", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-upstream-done-receipt-"),
		);
		try {
			await writeJson(path.join(rootDir, "package.json"), {
				name: "test",
				devDependencies: { "patch-package": "^8.0.1" },
			});
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "inventory.json"),
				{
					version: 2,
					upstreams: [
						{
							id: "gemini-api",
							glueSurfaceId: "gemini-runtime",
							sourceLocator: "https://ai.google.dev",
							publicContractSurface: "Gemini API",
							supportedVersionWindow: "env contract",
							pin: { required: true, mode: "env" },
							validationSuites: ["test:live"],
							rollbackPath: "restore env",
						},
						{
							id: "ghcr-ci-image",
							glueSurfaceId: "ci-image-runner",
							sourceLocator: ".github/ci-image.lock.json",
							publicContractSurface: "CI image digest",
							supportedVersionWindow: "digest",
							pin: { required: true, mode: "digest" },
							validationSuites: ["governance:pinned-source:check"],
							rollbackPath: "restore lock",
						},
						{
							id: "playwright-browser-assets",
							glueSurfaceId: "playwright-browser-runtime",
							sourceLocator: "package-lock.json",
							publicContractSurface: "playwright package",
							supportedVersionWindow: "lockfile",
							pin: { required: true, mode: "lockfile" },
							validationSuites: ["test:e2e"],
							rollbackPath: "restore lock",
						},
						{
							id: "python-sidecar-dependencies",
							glueSurfaceId: "python-sidecar-runtime",
							sourceLocator: "services/gemini-sidecar/requirements.txt",
							publicContractSurface: "python sidecar deps",
							supportedVersionWindow: "requirements",
							pin: { required: true, mode: "requirements-file" },
							validationSuites: ["py:smoke"],
							rollbackPath: "restore requirements",
						},
						{
							id: "patch-package-surface",
							glueSurfaceId: "patch-replay-layer",
							sourceLocator: "patches",
							publicContractSurface: "patch package",
							supportedVersionWindow: "patch registry",
							pin: { required: true, mode: "patch-registry" },
							validationSuites: ["governance:upstream:check"],
							rollbackPath: "restore patches",
						},
						{
							id: "upstream-sync-remotes",
							glueSurfaceId: "upstream-sync-git-remote",
							sourceLocator: "tooling/sync-upstream-init.mjs",
							publicContractSurface: "upstream remote",
							supportedVersionWindow: "canonical remote",
							pin: { required: true, mode: "commit-sha" },
							validationSuites: ["sync:upstream:check"],
							rollbackPath: "restore remote",
						},
						{
							id: "openui-upstream-reference",
							glueSurfaceId: "openui-upstream-reference",
							sourceLocator: "https://github.com/wandb/openui.git",
							publicContractSurface: "upstream repository",
							supportedVersionWindow: "reviewed commit",
							pin: { required: true, mode: "upstream-remote" },
							validationSuites: ["sync:upstream:check"],
							rollbackPath: "restore evidence",
						},
					],
				},
			);
			await writeJson(
				path.join(
					rootDir,
					"contracts",
					"upstream",
					"compatibility-matrix.json",
				),
				{ version: 1, entries: [] },
			);
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "patch-registry.json"),
				{ version: 1, manager: "patch-package", patches: [] },
			);
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "glue-surfaces.json"),
				{
					version: 1,
					surfaces: [
						{ id: "gemini-runtime" },
						{ id: "ci-image-runner" },
						{ id: "playwright-browser-runtime" },
						{ id: "python-sidecar-runtime" },
						{ id: "patch-replay-layer" },
						{ id: "upstream-sync-git-remote" },
						{ id: "openui-upstream-reference" },
					],
				},
			);
			await writeFile(
				path.join(rootDir, ".github", "ci-image.lock.json"),
				"{}\n",
			);
			await writeFile(path.join(rootDir, "package-lock.json"), "{}\n");
			await writeFile(
				path.join(rootDir, "services", "gemini-sidecar", "requirements.txt"),
				"google-genai>=1.0.0,<2.0.0\n",
			);
			await writeFile(
				path.join(rootDir, "tooling", "sync-upstream-init.mjs"),
				"export {};\n",
			);
			await writeAdoptionBacklog(rootDir, [
				{
					id: "openui-upstream-monthly-review",
					inventoryId: "openui-upstream-reference",
					title: "Review upstream OpenUI changes for selective port candidates",
					priority: "P1",
					status: "done",
					adoptionShape: "selective-port",
					sourceEvidence: "fixture",
					whyNow: "fixture coverage",
					localSurfaces: ["tooling/sync-upstream-init.mjs"],
					validationCommands: ["npm run repo:upstream:check"],
					rollbackPath: "revert fixture",
					owner: "devinfra",
				},
			]);

			const result = await runUpstreamGovernanceCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(
				result.errors.some((entry) =>
					entry.includes('missing done-receipt field "completedAt"'),
				),
			).toBe(true);
			expect(
				result.errors.some((entry) =>
					entry.includes('missing done-receipt field "sourceCommit"'),
				),
			).toBe(true);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("prints selective-port-first dryrun guidance instead of merge-first guidance", () => {
		const chunks: string[] = [];
		const write = process.stdout.write;

		process.stdout.write = ((chunk: string | Uint8Array) => {
			chunks.push(
				typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
			);
			return true;
		}) as typeof process.stdout.write;

		try {
			printDryRun({
				cwd: "/repo",
				hasOrigin: true,
				hasUpstream: true,
				currentBranch: "main",
				recommendedBranch: "chore/upstream-sync-20260321",
			});
		} finally {
			process.stdout.write = write;
		}

		const output = chunks.join("");

		expect(output).toContain(
			"Step 2: Selective port default (targeted adoption when needed)",
		);
		expect(output).toContain(
			"npm run security:history:audit # required after fetching upstream to catch reintroduced upstream-side history",
		);
		expect(output).toContain("Port only the needed change set into this repo");
		expect(output).toContain(
			"whole-repo merge/rebase is exceptional only; document why selective port is not realistic before considering it",
		);
		expect(output).not.toContain("merge default");
		expect(output).not.toContain("git merge --no-ff --log upstream/main");
	});
});
