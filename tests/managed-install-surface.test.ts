import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	prepareManagedInstallSurface,
	shouldUseManagedInstallSurface,
} from "../tooling/shared/managed-install-surface.mjs";

describe("managed install surface", () => {
	it("creates an external node_modules symlink and manifest for tmp verification roots", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-managed-install-root-"),
		);
		const targetRoot = path.join(
			rootDir,
			".runtime-cache",
			"tmp",
			"repo-verify-final",
		);
		try {
			const result = await prepareManagedInstallSurface({
				rootDir,
				targetRoot,
				env: process.env,
				ownerCommand: "repo:space:maintain",
				rebuildCommand: "npm run repo:space:maintain",
			});

			expect(result.managed).toBe(true);
			expect(
				shouldUseManagedInstallSurface(rootDir, targetRoot),
			).toBe(true);

			const nodeModulesPath = path.join(targetRoot, "node_modules");
			const nodeModulesStat = await fs.lstat(nodeModulesPath);
			expect(nodeModulesStat.isSymbolicLink()).toBe(true);
			expect(await fs.readlink(nodeModulesPath)).toBe(
				result.roots.managedInstallRoot,
			);

			const manifestText = await fs.readFile(
				path.join(targetRoot, ".openui-maintenance-manifest.json"),
				"utf8",
			);
			const manifest = JSON.parse(manifestText);
			expect(manifest.ownerCommand).toBe("repo:space:maintain");
			expect(manifest.rebuildCommand).toBe("npm run repo:space:maintain");
			expect(manifest.usesExternalPlaywrightCache).toBe(true);
			expect(manifest.usesExternalInstallSurface).toBe(true);
			expect(manifest.managedInstallRoot).toBe(result.roots.managedInstallRoot);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
			await fs.rm(path.join(os.tmpdir(), "openui-tooling-cache"), {
				recursive: true,
				force: true,
			});
		}
	});

	it("stays inert for ordinary workspace roots", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-managed-install-non-tmp-"),
		);
		try {
			const result = await prepareManagedInstallSurface({
				rootDir,
				targetRoot: path.join(rootDir, "apps", "web"),
				env: process.env,
			});
			expect(result.managed).toBe(false);
			expect(
				shouldUseManagedInstallSurface(rootDir, path.join(rootDir, "apps", "web")),
			).toBe(false);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
