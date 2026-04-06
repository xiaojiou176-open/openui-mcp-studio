#!/usr/bin/env node
import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function isPathOutsideRoot(rootDir, candidatePath) {
	const relativePath = path.relative(rootDir, candidatePath);
	return relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

function isPathInsideRoot(rootDir, candidatePath) {
	return !isPathOutsideRoot(rootDir, candidatePath);
}

function isErrorWithCode(error, code) {
	return (
		Boolean(error) &&
		typeof error === "object" &&
		"code" in error &&
		error.code === code
	);
}

async function resolveSafeWorktreeRoot(worktreeRoot) {
	const workspaceRoot = await realpath(process.cwd());
	const resolvedRoot = path.resolve(worktreeRoot);
	if (isPathOutsideRoot(workspaceRoot, resolvedRoot)) {
		throw new Error(
			`mutation worktree root must stay within workspace (received: ${worktreeRoot})`,
		);
	}

	try {
		const rootStats = await lstat(resolvedRoot);
		if (rootStats.isSymbolicLink()) {
			throw new Error(
				`mutation worktree root must not be a symlink (received: ${worktreeRoot})`,
			);
		}
		if (!rootStats.isDirectory()) {
			throw new Error(
				`mutation worktree root must be a directory (received: ${worktreeRoot})`,
			);
		}
	} catch (error) {
		if (!isErrorWithCode(error, "ENOENT")) {
			throw error;
		}
		await mkdir(resolvedRoot, { recursive: true });
	}

	const rootRealPath = await realpath(resolvedRoot);
	if (isPathOutsideRoot(workspaceRoot, rootRealPath)) {
		throw new Error(
			`mutation worktree root resolves outside workspace via symlink (received: ${worktreeRoot})`,
		);
	}

	return {
		worktreeRootPath: resolvedRoot,
		worktreeRootRealPath: rootRealPath,
	};
}

async function resolveManagedWorktreePath(worktreePath, worktreeRootRealPath) {
	const resolvedWorktreePath = path.resolve(worktreePath);
	if (!isPathInsideRoot(worktreeRootRealPath, resolvedWorktreePath)) {
		return null;
	}

	try {
		const resolvedWorktreeRealPath = await realpath(resolvedWorktreePath);
		if (!isPathInsideRoot(worktreeRootRealPath, resolvedWorktreeRealPath)) {
			return null;
		}
	} catch (error) {
		if (!isErrorWithCode(error, "ENOENT")) {
			throw error;
		}
	}

	return resolvedWorktreePath;
}

function parseWorktreePathsFromPorcelain(output) {
	return output
		.split("\n")
		.filter((line) => line.startsWith("worktree "))
		.map((line) => line.slice("worktree ".length).trim())
		.filter(Boolean);
}

function runGit(args, cwd = process.cwd()) {
	return new Promise((resolve) => {
		const child = spawn("git", args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		child.on("close", (code) => {
			resolve({ code: code ?? 1, stdout, stderr });
		});
		child.on("error", (error) => {
			resolve({ code: 1, stdout, stderr: `${stderr}\n${String(error)}` });
		});
	});
}

async function removeManagedRegisteredWorktrees(
	worktreeRootRealPath,
	gitListOutput,
) {
	const worktreePaths = parseWorktreePathsFromPorcelain(gitListOutput);
	const managedPaths = [];
	for (const worktreePath of worktreePaths) {
		const managedPath = await resolveManagedWorktreePath(
			worktreePath,
			worktreeRootRealPath,
		);
		if (managedPath) {
			managedPaths.push(managedPath);
		}
	}

	for (const managedPath of managedPaths) {
		let removeResult = await runGit([
			"worktree",
			"remove",
			"--force",
			managedPath,
		]);
		let failureText = `${removeResult.stderr || removeResult.stdout}`.trim();
		if (
			removeResult.code !== 0 &&
			/cannot remove a locked working tree/i.test(failureText)
		) {
			removeResult = await runGit([
				"worktree",
				"remove",
				"--force",
				"--force",
				managedPath,
			]);
			failureText = `${removeResult.stderr || removeResult.stdout}`.trim();
		}
		if (removeResult.code !== 0) {
			if (
				/validation failed/i.test(failureText) ||
				/does not exist/i.test(failureText) ||
				/non-existent location/i.test(failureText) ||
				/is not a working tree/i.test(failureText)
			) {
				await rm(managedPath, { recursive: true, force: true });
				continue;
			}
			throw new Error(
				`failed to remove mutation worktree: ${managedPath}\n${failureText}`,
			);
		}
	}

	return managedPaths.length;
}

async function removeResidualDirectories(
	worktreeRootPath,
	worktreeRootRealPath,
) {
	let entries;
	try {
		entries = await readdir(worktreeRootPath, { withFileTypes: true });
	} catch {
		return 0;
	}

	let removed = 0;
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		const candidatePath = path.join(worktreeRootPath, entry.name);
		let candidateRealPath;
		try {
			candidateRealPath = await realpath(candidatePath);
		} catch (error) {
			if (isErrorWithCode(error, "ENOENT")) {
				continue;
			}
			throw error;
		}
		if (!isPathInsideRoot(worktreeRootRealPath, candidateRealPath)) {
			throw new Error(
				`refusing to remove residual directory outside managed root: ${entry.name}`,
			);
		}
		await rm(candidatePath, {
			recursive: true,
			force: true,
		});
		removed += 1;
	}
	return removed;
}

export async function cleanMutationWorktrees(options = {}) {
	const configuredWorktreeRoot = path.resolve(
		options.worktreeRoot ?? ".runtime-cache/mutation/worktrees",
	);
	const { worktreeRootPath, worktreeRootRealPath } =
		await resolveSafeWorktreeRoot(configuredWorktreeRoot);

	const listResult = await runGit(["worktree", "list", "--porcelain"]);
	if (listResult.code !== 0) {
		throw new Error(
			`failed to list git worktrees: ${listResult.stderr || listResult.stdout}`,
		);
	}

	const removedRegistered = await removeManagedRegisteredWorktrees(
		worktreeRootRealPath,
		listResult.stdout,
	);
	const removedResidualDirs = await removeResidualDirectories(
		worktreeRootPath,
		worktreeRootRealPath,
	);

	const pruneResult = await runGit(["worktree", "prune", "--expire", "now"]);
	if (pruneResult.code !== 0) {
		throw new Error(
			`failed to prune git worktree metadata: ${pruneResult.stderr || pruneResult.stdout}`,
		);
	}

	return {
		worktreeRoot: worktreeRootPath,
		removedRegistered,
		removedResidualDirs,
	};
}

async function main() {
	const summary = await cleanMutationWorktrees();
	process.stdout.write(
		`[mutation-cleanup] root=${summary.worktreeRoot} removedRegistered=${summary.removedRegistered} removedResidualDirs=${summary.removedResidualDirs}\n`,
	);
}

if (process.argv[1]) {
	const isDirectExecution =
		import.meta.url === pathToFileURL(process.argv[1]).href;
	if (isDirectExecution) {
		main().catch((error) => {
			process.stderr.write(
				`[mutation-cleanup] fatal: ${error instanceof Error ? error.stack : String(error)}\n`,
			);
			process.exit(1);
		});
	}
}
