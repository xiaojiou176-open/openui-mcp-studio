#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
	copyFile,
	lstat,
	mkdir,
	readFile,
	readlink,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { cleanMutationWorktrees } from "./clean-mutation-worktrees.mjs";
import {
	DEFAULT_KEY_MODULES,
	DEFAULT_MIN_SAMPLES_PER_MODULE,
	DEFAULT_MIN_SAMPLES_PER_OPERATOR,
	DEFAULT_MUTATION_MODE,
	MODULE_TEST_COMMANDS,
	QUICK_MUTANT_IDS,
	STRATEGY_CATALOG,
} from "./mutation-smoke/catalog.mjs";

const DEFAULT_SUMMARY_PATH = ".runtime-cache/mutation/mutation-summary.json";
const SUMMARY_ROOT_DIR = ".runtime-cache/mutation";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_FORCE_KILL_GRACE_MS = 1_500;
const DEFAULT_QUICK_TARGET_TOTAL = 8;
const DEFAULT_QUICK_MIN_DISTINCT_OPERATORS = 3;
function parseMutationModeFromArgv(argv) {
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--mode") {
			const nextValue = argv[index + 1]?.trim().toLowerCase();
			if (!nextValue) {
				throw new Error("--mode requires a value: full or quick");
			}
			if (nextValue !== "full" && nextValue !== "quick") {
				throw new Error(`unsupported --mode value: ${nextValue}`);
			}
			return nextValue;
		}
		if (argument.startsWith("--mode=")) {
			const value = argument.slice("--mode=".length).trim().toLowerCase();
			if (value !== "full" && value !== "quick") {
				throw new Error(`unsupported --mode value: ${value}`);
			}
			return value;
		}
	}
	return DEFAULT_MUTATION_MODE;
}

function isErrorWithCode(error, code) {
	return (
		Boolean(error) &&
		typeof error === "object" &&
		"code" in error &&
		error.code === code
	);
}

function isPathOutsideRoot(rootPath, candidatePath) {
	const relativePath = path.relative(rootPath, candidatePath);
	return relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

function readMutationSummaryPathFromEnv() {
	return (
		process.env.OPENUI_MUTATION_SUMMARY_PATH?.trim() || DEFAULT_SUMMARY_PATH
	);
}

function assertMutationSummaryPathIsSafe(
	summaryPath,
	workspaceRoot = process.cwd(),
) {
	if (!summaryPath || summaryPath.trim().length === 0) {
		throw new Error("OPENUI_MUTATION_SUMMARY_PATH cannot be empty.");
	}
	if (path.isAbsolute(summaryPath)) {
		throw new Error(
			"OPENUI_MUTATION_SUMMARY_PATH must be a workspace-relative path.",
		);
	}
	if (!summaryPath.endsWith(".json")) {
		throw new Error("OPENUI_MUTATION_SUMMARY_PATH must use .json extension.");
	}

	const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
	const allowedRoot = path.resolve(resolvedWorkspaceRoot, SUMMARY_ROOT_DIR);
	const resolvedPath = path.resolve(resolvedWorkspaceRoot, summaryPath);
	const relativeToAllowedRoot = path.relative(allowedRoot, resolvedPath);
	if (
		relativeToAllowedRoot.startsWith("..") ||
		path.isAbsolute(relativeToAllowedRoot)
	) {
		throw new Error(
			`OPENUI_MUTATION_SUMMARY_PATH must stay within ${SUMMARY_ROOT_DIR} (received: ${summaryPath}).`,
		);
	}
}

async function resolveSafeMutationSummaryWriteTarget(
	summaryPath,
	workspaceRoot = process.cwd(),
) {
	assertMutationSummaryPathIsSafe(summaryPath, workspaceRoot);

	const resolvedWorkspaceRoot = await realpath(path.resolve(workspaceRoot));
	const allowedRoot = path.resolve(resolvedWorkspaceRoot, SUMMARY_ROOT_DIR);
	const resolvedPath = path.resolve(resolvedWorkspaceRoot, summaryPath);
	const summaryDirPath = path.dirname(resolvedPath);

	await mkdir(allowedRoot, { recursive: true });
	const allowedRootRealPath = await realpath(allowedRoot);
	if (isPathOutsideRoot(resolvedWorkspaceRoot, allowedRootRealPath)) {
		throw new Error(
			`OPENUI_MUTATION_SUMMARY_PATH root ${SUMMARY_ROOT_DIR} resolves outside workspace via symlink.`,
		);
	}

	await mkdir(summaryDirPath, { recursive: true });
	const summaryDirRealPath = await realpath(summaryDirPath);
	if (isPathOutsideRoot(allowedRootRealPath, summaryDirRealPath)) {
		throw new Error(
			`OPENUI_MUTATION_SUMMARY_PATH directory resolves outside ${SUMMARY_ROOT_DIR} via symlink (received: ${summaryPath}).`,
		);
	}

	try {
		const summaryFileStat = await lstat(resolvedPath);
		if (summaryFileStat.isSymbolicLink()) {
			throw new Error(
				`OPENUI_MUTATION_SUMMARY_PATH target must not be a symlink (received: ${summaryPath}).`,
			);
		}
		const summaryFileRealPath = await realpath(resolvedPath);
		if (isPathOutsideRoot(allowedRootRealPath, summaryFileRealPath)) {
			throw new Error(
				`OPENUI_MUTATION_SUMMARY_PATH target resolves outside ${SUMMARY_ROOT_DIR} via symlink (received: ${summaryPath}).`,
			);
		}
	} catch (error) {
		if (!isErrorWithCode(error, "ENOENT")) {
			throw error;
		}
	}

	return resolvedPath;
}

function parseBooleanEnv(name, fallback = false) {
	const raw = process.env[name]?.trim().toLowerCase();
	if (!raw) {
		return fallback;
	}
	return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parseListEnv(name) {
	const raw = process.env[name]?.trim();
	if (!raw) {
		return [];
	}
	return raw
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function parsePositiveIntegerEnv(name, fallback) {
	const raw = process.env[name]?.trim();
	if (!raw) {
		return fallback;
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

function parseKeyModules() {
	const override = parseListEnv("OPENUI_MUTATION_KEY_MODULES");
	if (override.length === 0) {
		return [...DEFAULT_KEY_MODULES];
	}
	return [...new Set(override)];
}

function parseQuickTargetTotal() {
	return parsePositiveIntegerEnv(
		"OPENUI_MUTATION_QUICK_TARGET_TOTAL",
		DEFAULT_QUICK_TARGET_TOTAL,
	);
}

function parseQuickMinDistinctOperators() {
	return parsePositiveIntegerEnv(
		"OPENUI_MUTATION_QUICK_MIN_DISTINCT_OPERATORS",
		DEFAULT_QUICK_MIN_DISTINCT_OPERATORS,
	);
}

function parseMinimumSamplesPerModule(mode) {
	const raw = process.env.OPENUI_MUTATION_MIN_SAMPLES_PER_MODULE;
	if (!raw) {
		return DEFAULT_MIN_SAMPLES_PER_MODULE[mode];
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 0) {
		return DEFAULT_MIN_SAMPLES_PER_MODULE[mode];
	}
	return parsed;
}

function parseMinimumSamplesPerOperator(mode) {
	const raw = process.env.OPENUI_MUTATION_MIN_SAMPLES_PER_OPERATOR;
	if (!raw) {
		return DEFAULT_MIN_SAMPLES_PER_OPERATOR[mode];
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 0) {
		return DEFAULT_MIN_SAMPLES_PER_OPERATOR[mode];
	}
	return parsed;
}

async function generateMutantsFromModuleStrategies(keyModules) {
	const moduleSet = new Set(keyModules);
	const contentCache = new Map();
	const selected = [];
	const skipped = [];
	for (const strategy of STRATEGY_CATALOG) {
		if (!moduleSet.has(strategy.module)) {
			skipped.push({
				id: strategy.id,
				module: strategy.module,
				reason: "module-not-selected",
			});
			continue;
		}
		const content =
			contentCache.get(strategy.module) ??
			(await readFile(path.resolve(strategy.module), "utf8"));
		contentCache.set(strategy.module, content);
		if (!content.includes(strategy.before)) {
			skipped.push({
				id: strategy.id,
				module: strategy.module,
				reason: "snippet-not-found",
			});
			continue;
		}
		const testCommand = MODULE_TEST_COMMANDS[strategy.module];
		if (!testCommand) {
			skipped.push({
				id: strategy.id,
				module: strategy.module,
				reason: "missing-test-command",
			});
			continue;
		}
		selected.push({
			id: strategy.id,
			module: strategy.module,
			operator: strategy.operator,
			file: strategy.module,
			before: strategy.before,
			after: strategy.after,
			testCommand,
			reason: strategy.reason,
		});
	}
	return {
		selected,
		skipped,
		totalStrategies: STRATEGY_CATALOG.length,
	};
}

function selectMutantsForMode(mode, generatedMutants, keyModules) {
	if (mode === "quick") {
		const selectedById = new Map();
		const appendIfMissing = (mutant) => {
			if (!selectedById.has(mutant.id)) {
				selectedById.set(mutant.id, mutant);
			}
		};
		const quickSeeds = generatedMutants.filter((mutant) =>
			QUICK_MUTANT_IDS.has(mutant.id),
		);
		for (const mutant of quickSeeds) {
			appendIfMissing(mutant);
		}

		for (const moduleName of keyModules) {
			const hasModuleMutant = Array.from(selectedById.values()).some(
				(mutant) => mutant.module === moduleName,
			);
			if (hasModuleMutant) {
				continue;
			}
			const moduleCandidate = generatedMutants.find(
				(mutant) => mutant.module === moduleName,
			);
			if (moduleCandidate) {
				appendIfMissing(moduleCandidate);
			}
		}

		const minDistinctOperators = parseQuickMinDistinctOperators();
		const distinctOperators = new Set(
			Array.from(selectedById.values()).map((mutant) => mutant.operator),
		);
		if (distinctOperators.size < minDistinctOperators) {
			for (const candidate of generatedMutants) {
				if (selectedById.has(candidate.id)) {
					continue;
				}
				if (distinctOperators.has(candidate.operator)) {
					continue;
				}
				appendIfMissing(candidate);
				distinctOperators.add(candidate.operator);
				if (distinctOperators.size >= minDistinctOperators) {
					break;
				}
			}
		}

		const quickTargetTotal = parseQuickTargetTotal();
		if (selectedById.size < quickTargetTotal) {
			for (const candidate of generatedMutants) {
				if (selectedById.has(candidate.id)) {
					continue;
				}
				appendIfMissing(candidate);
				if (selectedById.size >= quickTargetTotal) {
					break;
				}
			}
		}

		const quickMutants = Array.from(selectedById.values());
		if (quickMutants.length === 0) {
			throw new Error("quick mode has no configured mutants");
		}
		return quickMutants;
	}
	return generatedMutants;
}

function evaluateModuleSampling(mode, keyModules, selectedMutants) {
	const minSamplesPerModule = parseMinimumSamplesPerModule(mode);
	const enforceMinSamples = parseBooleanEnv(
		"OPENUI_MUTATION_ENFORCE_MIN_SAMPLES",
		true,
	);
	const requiredModules =
		mode === "full"
			? [...keyModules]
			: [...new Set(selectedMutants.map((mutant) => mutant.module))];

	const counts = Object.fromEntries(
		requiredModules.map((moduleName) => [moduleName, 0]),
	);
	for (const mutant of selectedMutants) {
		if (mutant.module in counts) {
			counts[mutant.module] += 1;
		}
	}

	const deficits = requiredModules
		.filter((moduleName) => counts[moduleName] < minSamplesPerModule)
		.map((moduleName) => ({
			module: moduleName,
			actual: counts[moduleName],
			required: minSamplesPerModule,
		}));

	const status =
		deficits.length === 0 ? "pass" : enforceMinSamples ? "fail" : "warn";
	const summary = {
		status,
		enforcement: enforceMinSamples ? "blocking" : "report-only",
		minSamplesPerModule,
		requiredModules,
		perModuleSelected: counts,
		deficits,
	};
	if (status === "fail") {
		const deficitText = deficits
			.map((item) => `${item.module}=${item.actual}/${item.required}`)
			.join(", ");
		throw new Error(
			`module sampling constraint failed (${summary.enforcement}): ${deficitText}`,
		);
	}
	return summary;
}

function evaluateOperatorSampling(mode, selectedMutants) {
	const minSamplesPerOperator = parseMinimumSamplesPerOperator(mode);
	const enforceMinSamples = parseBooleanEnv(
		"OPENUI_MUTATION_ENFORCE_OPERATOR_SAMPLES",
		true,
	);
	const operatorSet = new Set(selectedMutants.map((mutant) => mutant.operator));
	const requiredOperators = [...operatorSet].sort();
	const counts = Object.fromEntries(
		requiredOperators.map((operatorName) => [operatorName, 0]),
	);
	for (const mutant of selectedMutants) {
		if (mutant.operator in counts) {
			counts[mutant.operator] += 1;
		}
	}

	const deficits = requiredOperators
		.filter((operatorName) => counts[operatorName] < minSamplesPerOperator)
		.map((operatorName) => ({
			operator: operatorName,
			actual: counts[operatorName],
			required: minSamplesPerOperator,
		}));

	const status =
		deficits.length === 0 ? "pass" : enforceMinSamples ? "fail" : "warn";
	const summary = {
		status,
		enforcement: enforceMinSamples ? "blocking" : "report-only",
		minSamplesPerOperator,
		requiredOperators,
		perOperatorSelected: counts,
		deficits,
	};
	if (status === "fail") {
		const deficitText = deficits
			.map((item) => `${item.operator}=${item.actual}/${item.required}`)
			.join(", ");
		throw new Error(
			`operator sampling constraint failed (${summary.enforcement}): ${deficitText}`,
		);
	}
	return summary;
}

function runCommand(command, args, timeoutMs = 120_000, stdinInput = null) {
	const childEnv = { ...process.env };
	delete childEnv.GIT_INDEX_FILE;
	delete childEnv.GIT_DIR;
	delete childEnv.GIT_WORK_TREE;
	const forceKillGraceMsRaw = Number(
		process.env.OPENUI_MUTATION_FORCE_KILL_GRACE_MS ??
			DEFAULT_FORCE_KILL_GRACE_MS,
	);
	const forceKillGraceMs =
		Number.isInteger(forceKillGraceMsRaw) && forceKillGraceMsRaw > 0
			? forceKillGraceMsRaw
			: DEFAULT_FORCE_KILL_GRACE_MS;
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: process.cwd(),
			stdio: [stdinInput !== null ? "pipe" : "ignore", "pipe", "pipe"],
			env: childEnv,
		});
		let stdout = "";
		let stderr = "";
		let done = false;
		let forceKillTimer = null;
		const timer = setTimeout(() => {
			if (done) {
				return;
			}
			stderr += `[mutation-smoke] command timeout after ${timeoutMs}ms, sending SIGTERM\n`;
			child.kill("SIGTERM");
			forceKillTimer = setTimeout(() => {
				if (done) {
					return;
				}
				stderr += `[mutation-smoke] command still alive after ${forceKillGraceMs}ms grace, sending SIGKILL\n`;
				child.kill("SIGKILL");
			}, forceKillGraceMs);
			forceKillTimer.unref?.();
		}, timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		if (stdinInput !== null) {
			child.stdin.end(stdinInput);
		}
		child.on("close", (code) => {
			done = true;
			clearTimeout(timer);
			if (forceKillTimer !== null) {
				clearTimeout(forceKillTimer);
			}
			resolve({ code: code ?? 1, stdout, stderr });
		});
		child.on("error", (error) => {
			done = true;
			clearTimeout(timer);
			if (forceKillTimer !== null) {
				clearTimeout(forceKillTimer);
			}
			resolve({ code: 1, stdout, stderr: `${stderr}\n${String(error)}` });
		});
	});
}

function runCommandInCwd(
	command,
	args,
	cwd,
	timeoutMs = 120_000,
	stdinInput = null,
) {
	const childEnv = { ...process.env };
	delete childEnv.GIT_INDEX_FILE;
	delete childEnv.GIT_DIR;
	delete childEnv.GIT_WORK_TREE;
	const forceKillGraceMsRaw = Number(
		process.env.OPENUI_MUTATION_FORCE_KILL_GRACE_MS ??
			DEFAULT_FORCE_KILL_GRACE_MS,
	);
	const forceKillGraceMs =
		Number.isInteger(forceKillGraceMsRaw) && forceKillGraceMsRaw > 0
			? forceKillGraceMsRaw
			: DEFAULT_FORCE_KILL_GRACE_MS;
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd,
			stdio: [stdinInput !== null ? "pipe" : "ignore", "pipe", "pipe"],
			env: childEnv,
		});
		let stdout = "";
		let stderr = "";
		let done = false;
		let forceKillTimer = null;
		const timer = setTimeout(() => {
			if (done) {
				return;
			}
			stderr += `[mutation-smoke] command timeout after ${timeoutMs}ms, sending SIGTERM\n`;
			child.kill("SIGTERM");
			forceKillTimer = setTimeout(() => {
				if (done) {
					return;
				}
				stderr += `[mutation-smoke] command still alive after ${forceKillGraceMs}ms grace, sending SIGKILL\n`;
				child.kill("SIGKILL");
			}, forceKillGraceMs);
			forceKillTimer.unref?.();
		}, timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		if (stdinInput !== null) {
			child.stdin.end(stdinInput);
		}
		child.on("close", (code) => {
			done = true;
			clearTimeout(timer);
			if (forceKillTimer !== null) {
				clearTimeout(forceKillTimer);
			}
			resolve({ code: code ?? 1, stdout, stderr });
		});
		child.on("error", (error) => {
			done = true;
			clearTimeout(timer);
			if (forceKillTimer !== null) {
				clearTimeout(forceKillTimer);
			}
			resolve({ code: 1, stdout, stderr: `${stderr}\n${String(error)}` });
		});
	});
}

async function listTrackedWorkspaceChanges() {
	const result = await runCommand("git", [
		"diff",
		"--name-status",
		"-z",
		"HEAD",
		"--",
	]);
	if (result.code !== 0) {
		throw new Error(
			`cannot list tracked workspace changes: ${result.stderr || result.stdout}`,
		);
	}
	const tokens = result.stdout.split("\u0000").filter(Boolean);
	const changes = [];
	let cursor = 0;
	while (cursor < tokens.length) {
		const status = tokens[cursor++] ?? "";
		if (status.startsWith("R") || status.startsWith("C")) {
			const oldPath = tokens[cursor++] ?? "";
			const newPath = tokens[cursor++] ?? "";
			changes.push({ status, oldPath, newPath });
			continue;
		}
		const filePath = tokens[cursor++] ?? "";
		changes.push({ status, path: filePath });
	}
	return changes;
}

async function listUntrackedWorkspaceEntries() {
	const result = await runCommand("git", [
		"ls-files",
		"--others",
		"--exclude-standard",
		"-z",
	]);
	if (result.code !== 0) {
		throw new Error(
			`cannot list untracked workspace files: ${result.stderr || result.stdout}`,
		);
	}
	return result.stdout
		.split("\u0000")
		.map((value) => value.trim())
		.filter(Boolean);
}

async function syncUntrackedWorkspaceEntries(repoRoot, worktreeDir) {
	const untrackedFiles = await listUntrackedWorkspaceEntries();
	for (const relativePath of untrackedFiles) {
		const normalized = path.normalize(relativePath);
		if (
			normalized === ".runtime-cache" ||
			normalized.startsWith(`.runtime-cache${path.sep}`) ||
			normalized === "node_modules" ||
			normalized.startsWith(`node_modules${path.sep}`) ||
			normalized === ".git" ||
			normalized.startsWith(`.git${path.sep}`)
		) {
			continue;
		}

		const sourcePath = path.join(repoRoot, normalized);
		const targetPath = path.join(worktreeDir, normalized);
		const sourceStat = await lstat(sourcePath);
		await mkdir(path.dirname(targetPath), { recursive: true });
		if (sourceStat.isSymbolicLink()) {
			await rm(targetPath, { recursive: true, force: true });
			const linkTarget = await readlink(sourcePath);
			await symlink(linkTarget, targetPath);
			continue;
		}
		if (sourceStat.isDirectory()) {
			await mkdir(targetPath, { recursive: true });
			continue;
		}
		await copyFile(sourcePath, targetPath);
	}
}

async function syncTrackedWorkspaceChanges(repoRoot, worktreeDir) {
	const changes = await listTrackedWorkspaceChanges();
	for (const change of changes) {
		if ("oldPath" in change && "newPath" in change) {
			const oldTargetPath = path.join(worktreeDir, path.normalize(change.oldPath));
			await rm(oldTargetPath, { recursive: true, force: true });
			const newSourcePath = path.join(repoRoot, path.normalize(change.newPath));
			const newTargetPath = path.join(worktreeDir, path.normalize(change.newPath));
			await mkdir(path.dirname(newTargetPath), { recursive: true });
			const stat = await lstat(newSourcePath);
			if (stat.isDirectory()) {
				await mkdir(newTargetPath, { recursive: true });
			} else {
				await copyFile(newSourcePath, newTargetPath);
			}
			continue;
		}

		const relativePath = path.normalize(change.path);
		const targetPath = path.join(worktreeDir, relativePath);
		const sourcePath = path.join(repoRoot, relativePath);
		if (change.status.startsWith("D")) {
			await rm(targetPath, { recursive: true, force: true });
			continue;
		}

		await mkdir(path.dirname(targetPath), { recursive: true });
		const stat = await lstat(sourcePath);
		if (stat.isDirectory()) {
			await mkdir(targetPath, { recursive: true });
		} else {
			await copyFile(sourcePath, targetPath);
		}
	}
}

function replaceOnce(source, before, after, id) {
	const index = source.indexOf(before);
	if (index < 0) {
		throw new Error(`mutant ${id}: cannot find target snippet`);
	}
	return source.slice(0, index) + after + source.slice(index + before.length);
}

function buildModuleStats(results) {
	/** @type {Map<string, { total: number; killed: number; survived: number }>} */
	const moduleTotals = new Map();
	for (const result of results) {
		const key = result.module;
		const entry = moduleTotals.get(key) ?? { total: 0, killed: 0, survived: 0 };
		entry.total += 1;
		if (result.killed) {
			entry.killed += 1;
		} else {
			entry.survived += 1;
		}
		moduleTotals.set(key, entry);
	}

	/** @type {Record<string, { total: number; killed: number; survived: number; killRatio: number }>} */
	const moduleStats = {};
	for (const [moduleName, entry] of moduleTotals.entries()) {
		moduleStats[moduleName] = {
			total: entry.total,
			killed: entry.killed,
			survived: entry.survived,
			killRatio: entry.total === 0 ? 0 : (entry.killed / entry.total) * 100,
		};
	}
	return moduleStats;
}

function buildOperatorStats(results) {
	/** @type {Map<string, { total: number; killed: number; survived: number }>} */
	const operatorTotals = new Map();
	for (const result of results) {
		const key = result.operator;
		const entry = operatorTotals.get(key) ?? {
			total: 0,
			killed: 0,
			survived: 0,
		};
		entry.total += 1;
		if (result.killed) {
			entry.killed += 1;
		} else {
			entry.survived += 1;
		}
		operatorTotals.set(key, entry);
	}

	/** @type {Record<string, { total: number; killed: number; survived: number; killRatio: number }>} */
	const operatorStats = {};
	for (const [operatorName, entry] of operatorTotals.entries()) {
		operatorStats[operatorName] = {
			total: entry.total,
			killed: entry.killed,
			survived: entry.survived,
			killRatio: entry.total === 0 ? 0 : (entry.killed / entry.total) * 100,
		};
	}
	return operatorStats;
}

async function runMutant(mutant) {
	const repoRoot = process.cwd();
	const worktreeRoot = path.resolve(".runtime-cache/mutation/worktrees");
	await mkdir(worktreeRoot, { recursive: true });
	const worktreeDir = path.join(
		worktreeRoot,
		`${mutant.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
	);

	const addResult = await runCommand("git", [
		"worktree",
		"add",
		"--detach",
		worktreeDir,
		"HEAD",
	]);
	if (addResult.code !== 0) {
		throw new Error(
			`mutant ${mutant.id}: failed to create worktree: ${addResult.stderr || addResult.stdout}`,
		);
	}

	const worktreeNodeModules = path.join(worktreeDir, "node_modules");
	try {
		await lstat(worktreeNodeModules);
	} catch {
		await symlink(
			path.join(repoRoot, "node_modules"),
			worktreeNodeModules,
			"dir",
		);
	}

	const targetFile = path.join(worktreeDir, mutant.file);
	await syncTrackedWorkspaceChanges(repoRoot, worktreeDir);
	await syncUntrackedWorkspaceEntries(repoRoot, worktreeDir);
	const original = await readFile(targetFile, "utf8");
	const mutated = replaceOnce(original, mutant.before, mutant.after, mutant.id);
	await writeFile(targetFile, mutated, "utf8");

	try {
		const [command, ...args] = mutant.testCommand;
		const result = await runCommandInCwd(command, args, worktreeDir);
		const killed = result.code !== 0;
		return {
			id: mutant.id,
			module: mutant.module,
			operator: mutant.operator,
			file: mutant.file,
			killed,
			exitCode: result.code,
			testCommand: mutant.testCommand.join(" "),
			reason: mutant.reason,
			stderrPreview: result.stderr.split("\n").slice(0, 5).join("\n"),
		};
	} finally {
		const removeResult = await runCommand("git", [
			"worktree",
			"remove",
			"--force",
			worktreeDir,
		]);
		if (removeResult.code !== 0) {
			console.warn(
				`mutant ${mutant.id}: failed to cleanup worktree: ${removeResult.stderr || removeResult.stdout}`,
			);
		}
	}
}

async function main() {
	const mode = parseMutationModeFromArgv(process.argv.slice(2));
	const summaryPath = readMutationSummaryPathFromEnv();
	const resolvedSummaryPath =
		await resolveSafeMutationSummaryWriteTarget(summaryPath);
	const preCleanupSummary = await cleanMutationWorktrees();
	process.stdout.write(
		`[mutation-smoke] pre-cleanup removed registered=${preCleanupSummary.removedRegistered}, residual=${preCleanupSummary.removedResidualDirs}\n`,
	);
	const keyModules = parseKeyModules();
	const generation = await generateMutantsFromModuleStrategies(keyModules);
	const selectedMutants = selectMutantsForMode(
		mode,
		generation.selected,
		keyModules,
	);
	const moduleSampling = evaluateModuleSampling(
		mode,
		keyModules,
		selectedMutants,
	);
	const operatorSampling = evaluateOperatorSampling(mode, selectedMutants);

	process.stdout.write(
		`[mutation-smoke] mode=${mode} selected=${selectedMutants.length} strategies=${generation.totalStrategies} sampling=${moduleSampling.status} minPerModule=${moduleSampling.minSamplesPerModule} enforcement=${moduleSampling.enforcement}\n`,
	);
	if (moduleSampling.deficits.length > 0) {
		process.stdout.write(
			`[mutation-smoke] module sampling deficits: ${moduleSampling.deficits.map((item) => `${item.module}=${item.actual}/${item.required}`).join(", ")}\n`,
		);
	}
	if (operatorSampling.deficits.length > 0) {
		process.stdout.write(
			`[mutation-smoke] operator sampling deficits: ${operatorSampling.deficits.map((item) => `${item.operator}=${item.actual}/${item.required}`).join(", ")}\n`,
		);
	}

	const heartbeatIntervalRaw = Number(
		process.env.OPENUI_MUTATION_HEARTBEAT_INTERVAL_MS ??
			DEFAULT_HEARTBEAT_INTERVAL_MS,
	);
	const heartbeatIntervalMs =
		Number.isInteger(heartbeatIntervalRaw) && heartbeatIntervalRaw > 0
			? heartbeatIntervalRaw
			: DEFAULT_HEARTBEAT_INTERVAL_MS;
	const startedAt = Date.now();
	let completed = 0;
	const heartbeat = setInterval(() => {
		const elapsedSeconds = Math.max(
			0,
			Math.floor((Date.now() - startedAt) / 1000),
		);
		process.stdout.write(
			`[mutation-smoke][heartbeat] mode=${mode} elapsed=${elapsedSeconds}s completed=${completed}/${selectedMutants.length} interval=${heartbeatIntervalMs}ms\n`,
		);
	}, heartbeatIntervalMs);
	heartbeat.unref?.();

	const results = [];
	try {
		for (const mutant of selectedMutants) {
			process.stdout.write(`[mutation-smoke] running ${mutant.id}\n`);
			results.push(await runMutant(mutant));
			completed += 1;
		}
	} finally {
		clearInterval(heartbeat);
	}

	const total = results.length;
	const killed = results.filter((result) => result.killed).length;
	const survived = total - killed;
	const mutationScore = total === 0 ? 0 : (killed / total) * 100;

	const summary = {
		generatedAt: new Date().toISOString(),
		runner: "mutation-smoke",
		mode,
		mutationScore,
		total: { total, killed, survived },
		generation: {
			strategyCatalogSize: generation.totalStrategies,
			selectedFromStrategies: generation.selected.length,
			skippedStrategies: generation.skipped,
			keyModules,
		},
		moduleSampling,
		operatorSampling,
		moduleStats: buildModuleStats(results),
		operatorStats: buildOperatorStats(results),
		mutants: results,
	};

	await writeFile(
		resolvedSummaryPath,
		JSON.stringify(summary, null, 2),
		"utf8",
	);
	const postCleanupSummary = await cleanMutationWorktrees();
	process.stdout.write(
		`[mutation-smoke] summary written to ${summaryPath}; mode=${mode}; score=${mutationScore.toFixed(2)}%; moduleSampling=${moduleSampling.status}; operatorSampling=${operatorSampling.status}; postCleanupRegistered=${postCleanupSummary.removedRegistered}; postCleanupResidual=${postCleanupSummary.removedResidualDirs}\n`,
	);
}

function isDirectExecution() {
	if (!process.argv[1]) {
		return false;
	}
	return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
	main().catch((error) => {
		process.stderr.write(
			`[mutation-smoke] fatal: ${error instanceof Error ? error.stack : String(error)}\n`,
		);
		process.exit(1);
	});
}

export {
	assertMutationSummaryPathIsSafe,
	readMutationSummaryPathFromEnv,
	resolveSafeMutationSummaryWriteTarget,
	selectMutantsForMode,
};
