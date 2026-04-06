import fs from "node:fs/promises";
import path from "node:path";
import type { AcceptancePack } from "../../../packages/contracts/src/acceptance-pack.js";
import { buildAcceptancePack, evaluateAcceptancePack } from "./acceptance-pack.js";
import { detectShadcnPaths } from "./path-detection.js";
import { buildChildEnvFromAllowlist } from "../../../packages/shared-runtime/src/child-env.js";
import {
	isPathInsideRoot,
	normalizePath,
} from "../../../packages/shared-runtime/src/path-utils.js";
import { runProcess } from "../../../packages/shared-runtime/src/process-utils.js";
import type {
	CommandCheckResult,
	GeneratedFile,
	QualityIssue,
} from "./types.js";

type FileCheckItem = {
	path: string;
	content: string;
};

type CommandExecutionResult = CommandCheckResult & {
	timedOut: boolean;
};

type QualityPreset = "lint" | "typecheck" | "test" | "ci_gate";
type QualityMode = "strict" | "advisory";

const PRESET_SCRIPTS: Record<QualityPreset, string[]> = {
	lint: ["lint"],
	typecheck: ["typecheck"],
	test: ["test"],
	ci_gate: ["lint", "typecheck", "test"],
};

const SHELL_METACHAR_PATTERN = /[;&|`$><\n\r(){}[\]]/;

type PackageScriptsLoadResult = {
	scripts: Set<string>;
	degradedReason?: string;
};

function assertFilePathInsideRoot(
	filePath: string,
	targetRoot: string,
): string {
	if (path.isAbsolute(filePath)) {
		throw new Error(`filePaths must be relative to targetRoot: ${filePath}`);
	}

	const absoluteRoot = targetRoot;
	const absoluteCandidate = path.resolve(absoluteRoot, filePath);
	if (!isPathInsideRoot(absoluteRoot, absoluteCandidate)) {
		throw new Error(`filePaths cannot escape targetRoot: ${filePath}`);
	}

	return absoluteCandidate;
}

async function resolveReadableFilePath(
	filePath: string,
	targetRoot: string,
): Promise<string> {
	const absPath = assertFilePathInsideRoot(filePath, targetRoot);
	const stat = await fs.lstat(absPath);
	if (stat.isSymbolicLink()) {
		throw new Error(`Refusing to read symlinked file path: ${filePath}`);
	}
	if (!stat.isFile()) {
		throw new Error(`filePaths must reference files: ${filePath}`);
	}

	const realPath = await fs.realpath(absPath);
	if (!isPathInsideRoot(targetRoot, realPath)) {
		throw new Error(`filePaths cannot resolve outside targetRoot: ${filePath}`);
	}
	return realPath;
}

async function loadFileChecks(input: {
	files?: GeneratedFile[];
	filePaths?: string[];
	targetRoot: string;
}): Promise<FileCheckItem[]> {
	const checks: FileCheckItem[] = [];

	for (const file of input.files || []) {
		checks.push({
			path: normalizePath(file.path),
			content: file.content,
		});
	}

	for (const filePath of input.filePaths || []) {
		const normalizedPath = normalizePath(filePath);
		const realPath = await resolveReadableFilePath(
			normalizedPath,
			input.targetRoot,
		);
		const content = await fs.readFile(realPath, "utf8");
		checks.push({
			path: normalizedPath,
			content,
		});
	}

	return checks;
}

function pushIssue(
	bucket: QualityIssue[],
	severity: "error" | "warn",
	rule: string,
	filePath: string,
	message: string,
) {
	bucket.push({
		severity,
		rule,
		path: filePath,
		message,
	});
}

function lintGeneratedFile(
	file: FileCheckItem,
	uiImportBase: string,
	issues: QualityIssue[],
): void {
	if (/\sstyle\s*=/.test(file.content)) {
		pushIssue(
			issues,
			"error",
			"no_inline_style",
			file.path,
			"Found inline style attribute; use Tailwind classes instead.",
		);
	}

	if (
		/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/.test(file.content)
	) {
		pushIssue(
			issues,
			"warn",
			"no_hardcoded_hex_color",
			file.path,
			"Found hard-coded hex color token.",
		);
	}

	if (/(?:rgba?|hsla?)\s*\(/.test(file.content)) {
		pushIssue(
			issues,
			"warn",
			"no_hardcoded_color_function",
			file.path,
			"Found rgb/hsl color function; prefer design tokens and Tailwind utilities.",
		);
	}

	if (/\.(tsx|jsx)$/.test(file.path) && !/className\s*=/.test(file.content)) {
		pushIssue(
			issues,
			"warn",
			"expect_tailwind_classname",
			file.path,
			"No className found in TSX/JSX file.",
		);
	}

	const expectedPrefix = `${uiImportBase}/`;
	const hardcodedRelativeImport = /from\s+["']components\/ui\//.test(
		file.content,
	);
	if (uiImportBase.startsWith("@/") && hardcodedRelativeImport) {
		pushIssue(
			issues,
			"error",
			"prefer_alias_import_for_shadcn",
			file.path,
			`Found direct components/ui import; prefer alias ${expectedPrefix}...`,
		);
	}

	const isShadcnPrimitiveFile =
		/(?:^|\/)(?:src\/)?components\/ui\/[^/]+\.(tsx|jsx|ts|js)$/.test(
			file.path,
		) && !/index\.(tsx|jsx|ts|js)$/.test(file.path);
	if (isShadcnPrimitiveFile && !/\bcva\s*\(/.test(file.content)) {
		pushIssue(
			issues,
			"error",
			"require_cva_for_shadcn_primitive",
			file.path,
			"Core shadcn primitive is missing cva-based variant/state management.",
		);
	}

	const lineCount = file.content.split(/\r?\n/).length;
	if (lineCount > 450) {
		pushIssue(
			issues,
			"warn",
			"large_file",
			file.path,
			`File has ${lineCount} lines; consider splitting components further.`,
		);
	}
}

async function runNpmScript(
	scriptName: string,
	cwd: string,
	timeoutMs: number,
): Promise<CommandExecutionResult> {
	const command = `npm run ${scriptName}`;
	const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
	const childEnv = buildChildEnvFromAllowlist();
	const result = await runProcess({
		command: npmBin,
		args: ["run", scriptName],
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		env: childEnv,
		timeoutMs,
	});

	const terminatedBySignal =
		result.signal === "SIGTERM" || result.signal === "SIGKILL";
	const timedOut = result.timedOut || terminatedBySignal;
	const normalizedStderr =
		result.stderr.trim() ||
		(timedOut
			? `Command timed out after ${timeoutMs}ms`
			: result.errorMessage === null
				? ""
				: result.errorMessage.trim() || "Command failed");

	const failed = timedOut || result.exitCode !== 0;
	return {
		name: "npm",
		command,
		status: failed ? "failed" : "passed",
		exitCode: result.exitCode,
		stdout: result.stdout.trim(),
		stderr: normalizedStderr,
		durationMs: result.durationMs,
		timedOut,
		reason: timedOut ? "timeout" : undefined,
	};
}

async function loadPackageScripts(
	cwd: string,
): Promise<PackageScriptsLoadResult> {
	try {
		const packageJsonRaw = await fs.readFile(
			path.join(cwd, "package.json"),
			"utf8",
		);
		const parsed = JSON.parse(packageJsonRaw) as {
			scripts?: Record<string, unknown>;
		};
		const scripts = new Set<string>();

		for (const [name, script] of Object.entries(parsed.scripts || {})) {
			if (typeof script === "string" && script.trim().length > 0) {
				scripts.add(name);
			}
		}

		return { scripts };
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return {
				scripts: new Set<string>(),
				degradedReason: "package_json_missing",
			};
		}
		return {
			scripts: new Set<string>(),
			degradedReason: "package_json_unreadable",
		};
	}
}

function hasShellMetacharacters(command: string): boolean {
	return SHELL_METACHAR_PATTERN.test(command);
}

function assertFinitePositiveNumber(value: number, fieldName: string): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${fieldName} must be a finite number greater than 0.`);
	}
}

function assertFiniteNumberInRange(
	value: number,
	fieldName: string,
	min: number,
	max: number,
): void {
	if (!Number.isFinite(value) || value < min || value > max) {
		throw new Error(
			`${fieldName} must be a finite number between ${min} and ${max}.`,
		);
	}
}

export async function runQualityGate(input: {
	files?: GeneratedFile[];
	filePaths?: string[];
	targetRoot: string;
	runCommands?: boolean;
	preset?: QualityPreset;
	mode?: QualityMode;
	/**
	 * @deprecated Use `preset` instead. This field no longer executes arbitrary commands.
	 */
	lintCommand?: string;
	/**
	 * @deprecated Use `preset` instead. This field no longer executes arbitrary commands.
	 */
	typecheckCommand?: string;
	/**
	 * @deprecated Use `preset` instead. This field no longer executes arbitrary commands.
	 */
	testCommand?: string;
	commandTimeoutMs?: number;
	uiuxScore?: number;
	uiuxThreshold?: number;
	prompt?: string;
	acceptancePack?: AcceptancePack;
	acceptanceCriteria?: string[];
	responsiveRequirements?: string[];
	a11yRequirements?: string[];
	visualRequirements?: string[];
	manualReviewItems?: string[];
	smokePassed?: boolean;
}): Promise<{
	passed: boolean;
	issues: QualityIssue[];
	commandResults: CommandCheckResult[];
	checkedFiles: string[];
	acceptancePack?: AcceptancePack;
	acceptanceEvaluation?: ReturnType<typeof evaluateAcceptancePack>;
}> {
	const resolvedTargetRoot = await fs.realpath(path.resolve(input.targetRoot));
	const checks = await loadFileChecks({
		...input,
		targetRoot: resolvedTargetRoot,
	});
	if (!checks.length) {
		throw new Error("No files provided for quality gate");
	}

	const detection = await detectShadcnPaths(resolvedTargetRoot);
	const issues: QualityIssue[] = [];

	for (const file of checks) {
		lintGeneratedFile(file, detection.uiImportBase, issues);
	}

	if (typeof input.uiuxThreshold === "number") {
		assertFiniteNumberInRange(input.uiuxThreshold, "uiuxThreshold", 0, 100);
	}

	if (typeof input.uiuxScore === "number") {
		const threshold =
			typeof input.uiuxThreshold === "number" ? input.uiuxThreshold : 80;
		assertFiniteNumberInRange(input.uiuxScore, "uiuxScore", 0, 100);
		if (input.uiuxScore < threshold) {
			issues.push({
				severity: "error",
				rule: "uiux_score_below_threshold",
				path: "(workspace)",
				message: `UI/UX score ${input.uiuxScore} is below threshold ${threshold}.`,
			});
		}
	}

	const mode = input.mode ?? "strict";
	const deprecatedCommands = [
		["lintCommand", input.lintCommand],
		["typecheckCommand", input.typecheckCommand],
		["testCommand", input.testCommand],
	].filter((entry): entry is [string, string] => {
		const command = entry[1];
		return typeof command === "string" && command.trim().length > 0;
	});

	for (const [field, command] of deprecatedCommands) {
		if (mode === "strict" && hasShellMetacharacters(command)) {
			throw new Error(
				`Deprecated field "${field}" contains shell metacharacters and is rejected in strict mode. Use preset instead.`,
			);
		}

		pushIssue(
			issues,
			"warn",
			"deprecated_command_ignored",
			"(workspace)",
			`Deprecated field "${field}" is ignored. Use preset instead.`,
		);
	}

	const commandResults: CommandCheckResult[] = [];
	const shouldRunCommands = input.runCommands === true || !!input.preset;
	if (shouldRunCommands) {
		const preset = input.preset ?? "ci_gate";
		const scripts = PRESET_SCRIPTS[preset];
		const timeoutMs = input.commandTimeoutMs ?? 120_000;
		assertFinitePositiveNumber(timeoutMs, "commandTimeoutMs");
		const packageScripts = await loadPackageScripts(resolvedTargetRoot);

		if (packageScripts.degradedReason) {
			issues.push({
				severity: mode === "strict" ? "error" : "warn",
				rule: "command_matrix_degraded",
				path: "(workspace)",
				message:
					packageScripts.degradedReason === "package_json_missing"
						? "package.json is missing; preset command checks are skipped."
						: "package.json is unreadable; preset command checks are skipped.",
			});
		}

		for (const script of scripts) {
			if (!packageScripts.scripts.has(script)) {
				commandResults.push({
					name: "npm",
					command: `npm run ${script}`,
					status: "skipped",
					exitCode: null,
					stdout: "",
					stderr: "",
					durationMs: 0,
					reason: packageScripts.degradedReason
						? `${packageScripts.degradedReason}:${script}`
						: `script_missing:${script}`,
				});
				issues.push({
					severity: mode === "strict" ? "error" : "warn",
					rule: "command_skipped_missing_script",
					path: "(workspace)",
					message: `Skipped npm run ${script}: script is not defined in package.json.`,
				});
				continue;
			}

			const result = await runNpmScript(script, resolvedTargetRoot, timeoutMs);

			commandResults.push({
				name: result.name,
				command: result.command,
				status: result.status,
				exitCode: result.exitCode,
				stdout: result.stdout,
				stderr: result.stderr,
				durationMs: result.durationMs,
				reason: result.reason,
			});

			if (result.timedOut) {
				issues.push({
					severity: "error",
					rule: "command_timeout",
					path: "(workspace)",
					message: `${result.command} timed out after ${timeoutMs}ms`,
				});
			}

			if (result.exitCode !== 0) {
				issues.push({
					severity: "error",
					rule: "command_failed",
					path: "(workspace)",
					message: `${result.command} exited with code ${result.exitCode}`,
				});
			}
		}
	}

	const hasCommandFailure = commandResults.some(
		(result) => result.status === "failed",
	);
	const passed =
		!issues.some((issue) => issue.severity === "error") && !hasCommandFailure;

	const acceptancePack =
		input.acceptancePack ||
		(input.acceptanceCriteria?.length ||
		input.responsiveRequirements?.length ||
		input.a11yRequirements?.length ||
		input.visualRequirements?.length ||
		input.manualReviewItems?.length
			? buildAcceptancePack({
					prompt: input.prompt || "Generated change",
					acceptanceCriteria: input.acceptanceCriteria,
					responsiveRequirements: input.responsiveRequirements,
					a11yRequirements: input.a11yRequirements,
					visualRequirements: input.visualRequirements,
					manualReviewItems: input.manualReviewItems,
				})
			: undefined);

	const acceptanceEvaluation = acceptancePack
		? evaluateAcceptancePack({
				pack: acceptancePack,
				qualityPassed: passed,
				smokePassed: input.smokePassed,
			})
		: undefined;

	return {
		passed,
		issues,
		commandResults,
		checkedFiles: checks.map((file) => file.path),
		...(acceptancePack ? { acceptancePack } : {}),
		...(acceptanceEvaluation ? { acceptanceEvaluation } : {}),
	};
}
