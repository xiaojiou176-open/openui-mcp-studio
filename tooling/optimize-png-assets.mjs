#!/usr/bin/env node

import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const DEFAULT_PNG_PATHS = [
	"docs/assets",
	"tests/visual-golden",
];

function isPngPath(candidate) {
	return candidate.toLowerCase().endsWith(".png");
}

function parseTargets(argv) {
	if (argv.length === 0) {
		return DEFAULT_PNG_PATHS;
	}
	return argv;
}

async function collectPngFiles(targetPath) {
	const absoluteTarget = path.resolve(ROOT, targetPath);
	const targetStats = await stat(absoluteTarget);
	if (targetStats.isFile()) {
		return isPngPath(absoluteTarget) ? [absoluteTarget] : [];
	}

	const pngFiles = [];
	const entries = await readdir(absoluteTarget, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(absoluteTarget, entry.name);
		if (entry.isDirectory()) {
			pngFiles.push(...(await collectPngFiles(entryPath)));
			continue;
		}
		if (entry.isFile() && isPngPath(entry.name)) {
			pngFiles.push(entryPath);
		}
	}
	return pngFiles;
}

function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: ROOT,
			env: { ...process.env, ...(options.env ?? {}) },
			stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
		});
		let stdout = "";
		let stderr = "";
		if (options.capture) {
			child.stdout?.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			child.stderr?.on("data", (chunk) => {
				stderr += chunk.toString();
			});
		}
		child.once("error", reject);
		child.once("close", (code, signal) => {
			if (signal) {
				reject(new Error(`${command} terminated by signal ${signal}`));
				return;
			}
			resolve({ code: code ?? 1, stdout, stderr });
		});
	});
}

async function resolvePreCommitCommand(tempRoot) {
	const direct = await runCommand("pre-commit", ["--version"], { capture: true }).catch(
		() => null,
	);
	if (direct && direct.code === 0) {
		return {
			command: "pre-commit",
			env: {
				PRE_COMMIT_HOME: path.join(tempRoot, "pre-commit-home"),
			},
		};
	}

	const venvRoot = path.join(tempRoot, "precommit-venv");
	const python = process.env.PYTHON3 ?? "python3";
	const createVenv = await runCommand(python, ["-m", "venv", venvRoot]).catch(
		(error) => {
			throw new Error(`failed to create pre-commit venv: ${String(error)}`);
		},
	);
	if (createVenv.code !== 0) {
		throw new Error("failed to create pre-commit venv");
	}
	const venvPython = path.join(venvRoot, "bin", "python");
	const install = await runCommand(venvPython, [
		"-m",
		"pip",
		"install",
		"--upgrade",
		"pip",
		"pre-commit",
	]);
	if (install.code !== 0) {
		throw new Error("failed to install pre-commit into temporary venv");
	}
	return {
		command: path.join(venvRoot, "bin", "pre-commit"),
		env: {
			PRE_COMMIT_HOME: path.join(tempRoot, "pre-commit-home"),
		},
	};
}

async function runOxipngHook(preCommit, targets) {
	const args = ["run", "oxipng", "--files", ...targets];
	const firstPass = await runCommand(preCommit.command, args, {
		capture: true,
		env: preCommit.env,
	});
	if (firstPass.code === 0) {
		process.stdout.write(firstPass.stdout);
		process.stderr.write(firstPass.stderr);
		return;
	}
	const combined = `${firstPass.stdout}\n${firstPass.stderr}`;
	if (!combined.includes("files were modified by this hook")) {
		process.stdout.write(firstPass.stdout);
		process.stderr.write(firstPass.stderr);
		throw new Error(`oxipng hook failed with exit code ${firstPass.code}`);
	}

	process.stdout.write(firstPass.stdout);
	process.stderr.write(firstPass.stderr);
	const secondPass = await runCommand(preCommit.command, args, {
		capture: true,
		env: preCommit.env,
	});
	process.stdout.write(secondPass.stdout);
	process.stderr.write(secondPass.stderr);
	if (secondPass.code !== 0) {
		throw new Error(`oxipng hook failed on verification pass with exit code ${secondPass.code}`);
	}
}

async function main() {
	const requestedTargets = parseTargets(process.argv.slice(2));
	const targets = [];
	for (const target of requestedTargets) {
		targets.push(...(await collectPngFiles(target)));
	}
	const relativeTargets = [...new Set(targets.map((target) => path.relative(ROOT, target)))];
	if (relativeTargets.length === 0) {
		throw new Error("no PNG files matched the requested targets");
	}
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), "openui-oxipng-"));
	try {
		const preCommit = await resolvePreCommitCommand(tempRoot);
		await runOxipngHook(preCommit, relativeTargets);
		console.log(
			`[optimize-png-assets] OK: oxipng normalized ${relativeTargets.join(", ")}`,
		);
	} finally {
		await rm(tempRoot, { force: true, recursive: true }).catch(() => {});
	}
}

main().catch((error) => {
	console.error(
		`[optimize-png-assets] ERROR: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
