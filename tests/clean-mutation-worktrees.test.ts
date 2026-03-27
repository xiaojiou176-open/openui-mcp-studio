import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const cleanupScriptPath = path.join(
	repoRoot,
	"tooling",
	"clean-mutation-worktrees.mjs",
);

async function initGitRepo(cwd: string): Promise<void> {
	await execFileAsync("git", ["init"], { cwd });
	await execFileAsync("git", ["config", "user.email", "ci@example.com"], {
		cwd,
	});
	await execFileAsync("git", ["config", "user.name", "ci"], {
		cwd,
	});
	await fs.writeFile(path.join(cwd, "README.md"), "seed\n", "utf8");
	await execFileAsync("git", ["add", "README.md"], { cwd });
	await execFileAsync("git", ["commit", "-m", "seed"], { cwd });
}

describe("clean mutation worktrees script", () => {
	it("removes managed mutation worktrees and residual directories", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-worktree-cleanup-"),
		);
		const managedWorktreeDir = path.join(
			tempRoot,
			".runtime-cache",
			"mutation",
			"worktrees",
			"mutant-1",
		);
		const residualDir = path.join(
			tempRoot,
			".runtime-cache",
			"mutation",
			"worktrees",
			"residual-only",
		);

		try {
			await initGitRepo(tempRoot);

			await fs.mkdir(path.dirname(managedWorktreeDir), { recursive: true });
			await execFileAsync(
				"git",
				["worktree", "add", "--detach", managedWorktreeDir, "HEAD"],
				{
					cwd: tempRoot,
				},
			);
			await fs.mkdir(residualDir, { recursive: true });
			await fs.writeFile(path.join(residualDir, "orphan.txt"), "x", "utf8");

			const { stdout } = await execFileAsync(
				process.execPath,
				[cleanupScriptPath],
				{
					cwd: tempRoot,
				},
			);

			expect(stdout).toContain("[mutation-cleanup]");
			const { stdout: worktreeList } = await execFileAsync(
				"git",
				["worktree", "list", "--porcelain"],
				{ cwd: tempRoot },
			);

			expect(worktreeList).not.toContain(managedWorktreeDir);
			await expect(fs.stat(managedWorktreeDir)).rejects.toMatchObject({
				code: "ENOENT",
			});
			await expect(fs.stat(residualDir)).rejects.toMatchObject({
				code: "ENOENT",
			});
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 30_000);

	it("does not remove worktrees outside managed root boundary", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-worktree-boundary-"),
		);
		const worktreeRoot = path.join(
			tempRoot,
			".runtime-cache",
			"mutation",
			"worktrees",
		);
		const managedWorktreeDir = path.join(worktreeRoot, "mutant-managed");
		const externalWorktreeDir = path.join(tempRoot, "external-kept-worktree");

		try {
			await initGitRepo(tempRoot);

			await fs.mkdir(worktreeRoot, { recursive: true });
			await execFileAsync(
				"git",
				["worktree", "add", "--detach", managedWorktreeDir, "HEAD"],
				{ cwd: tempRoot },
			);
			await execFileAsync(
				"git",
				["worktree", "add", "--detach", externalWorktreeDir, "HEAD"],
				{ cwd: tempRoot },
			);

			const { stdout } = await execFileAsync(
				process.execPath,
				[cleanupScriptPath],
				{
					cwd: tempRoot,
				},
			);
			expect(stdout).toContain("[mutation-cleanup]");

			const { stdout: worktreeList } = await execFileAsync(
				"git",
				["worktree", "list", "--porcelain"],
				{ cwd: tempRoot },
			);
			expect(worktreeList).not.toContain(managedWorktreeDir);
			expect(worktreeList).toContain(externalWorktreeDir);

			await expect(fs.stat(managedWorktreeDir)).rejects.toMatchObject({
				code: "ENOENT",
			});
			const externalStats = await fs.stat(externalWorktreeDir);
			expect(externalStats.isDirectory()).toBe(true);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 30_000);

	it("keeps residual files under managed root and removes only directories", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-worktree-residual-file-"),
		);
		const worktreeRoot = path.join(
			tempRoot,
			".runtime-cache",
			"mutation",
			"worktrees",
		);
		const residualDir = path.join(worktreeRoot, "stale-dir");
		const residualFile = path.join(worktreeRoot, "keep-me.txt");

		try {
			await initGitRepo(tempRoot);
			await fs.mkdir(residualDir, { recursive: true });
			await fs.writeFile(path.join(residualDir, "temp.txt"), "x", "utf8");
			await fs.writeFile(residualFile, "keep", "utf8");

			await execFileAsync(process.execPath, [cleanupScriptPath], {
				cwd: tempRoot,
			});

			await expect(fs.stat(residualDir)).rejects.toMatchObject({
				code: "ENOENT",
			});
			const fileStats = await fs.stat(residualFile);
			expect(fileStats.isFile()).toBe(true);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 30_000);

	it("fails when managed worktree root resolves outside workspace via symlink", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-worktree-symlink-root-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-worktree-symlink-outside-"),
		);
		const markerFile = path.join(outsideRoot, "outside-keep.txt");
		const runtimeCacheDir = path.join(tempRoot, ".runtime-cache");
		const mutationRootLink = path.join(runtimeCacheDir, "mutation");

		try {
			await initGitRepo(tempRoot);
			await fs.mkdir(runtimeCacheDir, { recursive: true });
			await fs.symlink(outsideRoot, mutationRootLink, "dir");
			await fs.writeFile(markerFile, "keep", "utf8");

			const result = await execFileAsync(
				process.execPath,
				[cleanupScriptPath],
				{
					cwd: tempRoot,
				},
			)
				.then(() => ({ code: 0, stderr: "" }))
				.catch((error: { code?: number; stderr?: string }) => ({
					code: typeof error.code === "number" ? error.code : 1,
					stderr: error.stderr ?? "",
				}));

			expect(result.code).toBe(1);
			expect(result.stderr).toContain(
				"mutation worktree root resolves outside workspace via symlink",
			);
			await expect(fs.readFile(markerFile, "utf8")).resolves.toBe("keep");
		} finally {
			await Promise.all([
				fs.rm(tempRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	}, 30_000);

	it("fails with git-list error outside a git repository", async () => {
		const nonGitTmpRoot =
			process.platform === "linux" ? "/dev/shm" : os.tmpdir();
		const tempRoot = await fs.mkdtemp(
			path.join(nonGitTmpRoot, "openui-mutation-worktree-git-fail-"),
		);
		try {
			const result = await execFileAsync(
				process.execPath,
				[cleanupScriptPath],
				{
					cwd: tempRoot,
				},
			)
				.then(() => ({ code: 0, stderr: "" }))
				.catch((error: { code?: number; stderr?: string }) => ({
					code: typeof error.code === "number" ? error.code : 1,
					stderr: error.stderr ?? "",
				}));

			expect(result.code).toBe(1);
			expect(result.stderr).toContain("[mutation-cleanup] fatal:");
			expect(result.stderr).toContain("failed to list git worktrees");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});
