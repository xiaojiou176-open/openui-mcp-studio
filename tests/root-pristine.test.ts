import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRootPristineCheck } from "../tooling/check-root-pristine.mjs";

async function writeJson(filePath: string, value: unknown) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("root pristine governance", () => {
	it("allows machine-managed install surfaces declared by the root contract", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-root-pristine-allow-"),
		);
		try {
			await writeJson(
				path.join(rootDir, "contracts", "governance", "root-allowlist.json"),
				{
					version: 2,
					mode: "authoritative-only",
					trackedDirectories: ["contracts"],
					trackedFiles: ["README.md"],
					machineManagedInstallSurface: ["node_modules"],
					machineManagedRuntimeSurface: [".runtime-cache"],
					localDevelopmentDirectories: [],
					localDevelopmentFiles: [],
					forbiddenPatterns: ["tmp*", "*.log"],
				},
			);
			await fs.writeFile(path.join(rootDir, "README.md"), "# ok\n", "utf8");
			await fs.mkdir(path.join(rootDir, "node_modules"), { recursive: true });

			const result = await runRootPristineCheck({
				rootDir,
				containerExecution: true,
			});

			expect(result.ok).toBe(true);
			expect(result.errors).toEqual([]);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("still fails on node_modules when the install surface is not declared", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-root-pristine-block-"),
		);
		try {
			await writeJson(
				path.join(rootDir, "contracts", "governance", "root-allowlist.json"),
				{
					version: 2,
					mode: "authoritative-only",
					trackedDirectories: ["contracts"],
					trackedFiles: ["README.md"],
					machineManagedInstallSurface: [],
					machineManagedRuntimeSurface: [".runtime-cache"],
					localDevelopmentDirectories: [],
					localDevelopmentFiles: [],
					forbiddenPatterns: ["tmp*", "*.log"],
				},
			);
			await fs.writeFile(path.join(rootDir, "README.md"), "# ok\n", "utf8");
			await fs.mkdir(path.join(rootDir, "node_modules"), { recursive: true });

			const result = await runRootPristineCheck({
				rootDir,
				containerExecution: true,
			});

			expect(result.ok).toBe(false);
			expect(result.errors).toContain(
				"forbidden root entry exists: node_modules",
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("allows node_modules in containers only when container install surface is declared", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-root-pristine-container-allow-"),
		);
		try {
			await writeJson(
				path.join(rootDir, "contracts", "governance", "root-allowlist.json"),
				{
					version: 2,
					mode: "authoritative-only",
					trackedDirectories: ["contracts"],
					trackedFiles: ["README.md"],
					machineManagedInstallSurface: [],
					containerOnlyInstallSurface: ["node_modules"],
					machineManagedRuntimeSurface: [".runtime-cache"],
					localDevelopmentDirectories: [],
					localDevelopmentFiles: [],
					forbiddenPatterns: ["tmp*", "*.log"],
				},
			);
			await fs.writeFile(path.join(rootDir, "README.md"), "# ok\n", "utf8");
			await fs.mkdir(path.join(rootDir, "node_modules"), { recursive: true });

			const result = await runRootPristineCheck({
				rootDir,
				containerExecution: true,
			});

			expect(result.ok).toBe(true);
			expect(result.errors).toEqual([]);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
