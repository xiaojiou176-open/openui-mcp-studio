import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const tsxCliPath = path.join(
	repoRoot,
	"node_modules",
	"tsx",
	"dist",
	"cli.mjs",
);
const prepareScriptPath = path.join(repoRoot, "tooling", "prepare-next-app.ts");
const visualQaScriptPath = path.join(repoRoot, "tooling", "visual-qa.ts");

async function runScript(
	cwd: string,
	scriptPath: string,
	args: string[],
): Promise<{ code: number; stderr: string }> {
	return execFileAsync(process.execPath, [tsxCliPath, scriptPath, ...args], {
		cwd,
	})
		.then(() => ({ code: 0, stderr: "" }))
		.catch((error: { code?: number; stderr?: string }) => ({
			code: typeof error.code === "number" ? error.code : 1,
			stderr: error.stderr ?? "",
		}));
}

describe("fixture target-root workspace security", () => {
	it("prepare-next-app rejects target roots outside workspace", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-prepare-target-workspace-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-prepare-target-outside-"),
		);

		try {
			const result = await runScript(workspaceRoot, prepareScriptPath, [
				"--target-root",
				outsideRoot,
			]);
			expect(result.code).toBe(1);
			expect(result.stderr).toContain(
				"--target-root must stay within workspace",
			);
		} finally {
			await Promise.all([
				fs.rm(workspaceRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	});

	it("prepare-next-app rejects symlink target roots", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-prepare-target-symlink-workspace-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-prepare-target-symlink-outside-"),
		);
		const symlinkTarget = path.join(workspaceRoot, "fixture-link");

		try {
			await fs.symlink(outsideRoot, symlinkTarget, "dir");
			const result = await runScript(workspaceRoot, prepareScriptPath, [
				"--target-root",
				"fixture-link",
			]);
			expect(result.code).toBe(1);
			expect(result.stderr).toContain("--target-root must not be a symlink");
		} finally {
			await Promise.all([
				fs.rm(workspaceRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	});

	it("visual-qa rejects target roots outside workspace", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-visual-target-workspace-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-visual-target-outside-"),
		);

		try {
			const result = await runScript(workspaceRoot, visualQaScriptPath, [
				"--target-root",
				outsideRoot,
			]);
			expect(result.code).toBe(1);
			expect(result.stderr).toContain(
				"--target-root must stay within workspace",
			);
		} finally {
			await Promise.all([
				fs.rm(workspaceRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	}, 15_000);

	it("visual-qa rejects symlink target roots", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-visual-target-symlink-workspace-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-visual-target-symlink-outside-"),
		);
		const symlinkTarget = path.join(workspaceRoot, "fixture-link");

		try {
			await fs.symlink(outsideRoot, symlinkTarget, "dir");
			const result = await runScript(workspaceRoot, visualQaScriptPath, [
				"--target-root",
				"fixture-link",
			]);
			expect(result.code).toBe(1);
			expect(result.stderr).toContain("--target-root must not be a symlink");
		} finally {
			await Promise.all([
				fs.rm(workspaceRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	}, 15_000);
});
