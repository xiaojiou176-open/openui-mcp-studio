import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildChildEnvFromAllowlist } from "../packages/shared-runtime/src/child-env.js";
import { resolveRuntimeRunId } from "../packages/runtime-observability/src/run-context.js";
import {
	getTargetBuildManifestStatus,
	writeTargetBuildManifest,
} from "../packages/shared-runtime/src/target-build-manifest.js";
import { resolveNextBuildDir } from "../packages/shared-runtime/src/next-build-dir.js";
import { runProcess } from "../packages/shared-runtime/src/process-utils.js";
import {
	findOpenPort,
	pathExists,
	waitForHttpReady,
} from "../packages/shared-runtime/src/runtime-ops.js";
import { comparePngBuffers } from "../services/mcp-server/src/public/visual-diff.js";

type CliOptions = {
	updateGolden: boolean;
	targetRoot?: string;
	maxDiffPixels: number;
	maxDiffRatio: number;
	pixelmatchThreshold: number;
};

function isPathOutsideRoot(rootPath: string, candidatePath: string): boolean {
	const relativePath = path.relative(rootPath, candidatePath);
	return relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

function isErrorWithCode(
	error: unknown,
	code: string,
): error is NodeJS.ErrnoException {
	return (
		Boolean(error) &&
		typeof error === "object" &&
		"code" in error &&
		error.code === code
	);
}

const LOCAL_MAX_DIFF_PIXELS = 1_200;
const LOCAL_MAX_DIFF_RATIO = 0.005;
const CI_MAX_DIFF_PIXELS = 1_200;
const CI_MAX_DIFF_RATIO = 0.005;
const DEFAULT_PIXELMATCH_THRESHOLD = 0.1;
const DEFAULT_MIN_DARK_DIFF_RATIO = 0;
const DEFAULT_BUILD_TIMEOUT_MS = 180_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_SCREENSHOT_TIMEOUT_MS = 30_000;
const VISUAL_QA_REQUIRE_DARK_VARIATION =
	process.env.VISUAL_QA_REQUIRE_DARK_VARIATION === "1" ||
	process.env.VISUAL_QA_REQUIRE_DARK_VARIATION === "true";
const VISUAL_QA_MIN_DARK_DIFF_RATIO =
	readNonNegativeNumberEnv("VISUAL_QA_MIN_DARK_DIFF_RATIO") ??
	DEFAULT_MIN_DARK_DIFF_RATIO;
const REQUIRED_NEXT_BUILD_PACKAGES = [
	"next",
	"react",
	"react-dom",
	"typescript",
	"@types/react",
	"@types/react-dom",
] as const;
const VISUAL_SCENARIOS = Object.freeze([
	{
		id: "desktop-light",
		viewport: { width: 1280, height: 720 },
		colorScheme: "light" as const,
	},
	{
		id: "mobile-light",
		viewport: { width: 390, height: 844 },
		colorScheme: "light" as const,
	},
	{
		id: "desktop-dark",
		viewport: { width: 1280, height: 720 },
		colorScheme: "dark" as const,
	},
]);

function parseNonNegativeNumberFlag(
	raw: string | undefined,
	fallback: number,
): number {
	if (!raw) {
		return fallback;
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`Invalid numeric flag value: ${JSON.stringify(raw)}.`);
	}
	return parsed;
}

function parsePixelmatchThresholdFlag(
	raw: string | undefined,
	fallback: number,
): number {
	if (!raw) {
		return fallback;
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
		throw new Error(`Invalid numeric flag value: ${JSON.stringify(raw)}.`);
	}
	return parsed;
}

function readNonNegativeNumberEnv(name: string): number | null {
	const value = process.env[name];
	if (!value) {
		return null;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`Invalid env ${name}: ${JSON.stringify(value)}.`);
	}
	return parsed;
}

function resolveDefaultVisualThresholds(): {
	maxDiffPixels: number;
	maxDiffRatio: number;
} {
	const envPixels = readNonNegativeNumberEnv("VISUAL_QA_MAX_DIFF_PIXELS");
	const envRatio = readNonNegativeNumberEnv("VISUAL_QA_MAX_DIFF_RATIO");
	const isCi = process.env.CI === "true";

	return {
		maxDiffPixels:
			envPixels ?? (isCi ? CI_MAX_DIFF_PIXELS : LOCAL_MAX_DIFF_PIXELS),
		maxDiffRatio: envRatio ?? (isCi ? CI_MAX_DIFF_RATIO : LOCAL_MAX_DIFF_RATIO),
	};
}

function parseCliOptions(argv: string[]): CliOptions {
	const defaults = resolveDefaultVisualThresholds();
	const options: CliOptions = {
		updateGolden: false,
		maxDiffPixels: defaults.maxDiffPixels,
		maxDiffRatio: defaults.maxDiffRatio,
		pixelmatchThreshold: DEFAULT_PIXELMATCH_THRESHOLD,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--update") {
			options.updateGolden = true;
			continue;
		}
		if (arg === "--target-root") {
			options.targetRoot = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg === "--compat-fixture") {
			throw new Error(
				"--compat-fixture has been removed. apps/web is the only default visual target.",
			);
		}
		if (arg === "--max-diff-pixels") {
			options.maxDiffPixels = parseNonNegativeNumberFlag(
				argv[index + 1],
				defaults.maxDiffPixels,
			);
			index += 1;
			continue;
		}
		if (arg === "--max-diff-ratio") {
			options.maxDiffRatio = parseNonNegativeNumberFlag(
				argv[index + 1],
				defaults.maxDiffRatio,
			);
			index += 1;
			continue;
		}
		if (arg === "--pixelmatch-threshold") {
			options.pixelmatchThreshold = parsePixelmatchThresholdFlag(
				argv[index + 1],
				DEFAULT_PIXELMATCH_THRESHOLD,
			);
			index += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}

	return options;
}

function getDefaultAppRoot(): string {
	const currentFilePath = fileURLToPath(import.meta.url);
	const currentDir = path.dirname(currentFilePath);
	return path.resolve(currentDir, "..", "apps", "web");
}

async function resolveSafeTargetRoot(targetRoot: string): Promise<string> {
	const workspaceRoot = path.resolve(process.cwd());
	const workspaceRealRoot = await fs.realpath(workspaceRoot);
	const resolvedTargetRoot = path.resolve(workspaceRoot, targetRoot);
	if (isPathOutsideRoot(workspaceRoot, resolvedTargetRoot)) {
		throw new Error(
			`--target-root must stay within workspace (received: ${targetRoot}).`,
		);
	}

	let targetStat: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		targetStat = await fs.lstat(resolvedTargetRoot);
	} catch (error) {
		if (isErrorWithCode(error, "ENOENT")) {
			throw new Error(
				`--target-root must exist and be a directory (received: ${targetRoot}).`,
				{ cause: error },
			);
		}
		throw new Error(
			`Failed to resolve target root (received: ${targetRoot}).`,
			{ cause: error },
		);
	}

	if (targetStat.isSymbolicLink()) {
		throw new Error(
			`--target-root must not be a symlink (received: ${targetRoot}).`,
		);
	}
	if (!targetStat.isDirectory()) {
		throw new Error(
			`--target-root must be a directory (received: ${targetRoot}).`,
		);
	}

	const targetRootRealPath = await fs.realpath(resolvedTargetRoot);
	if (isPathOutsideRoot(workspaceRealRoot, targetRootRealPath)) {
		throw new Error(
			`--target-root resolves outside workspace via symlink (received: ${targetRoot}).`,
		);
	}
	return resolvedTargetRoot;
}

function getNextBinPath(root: string): string {
	if (process.platform !== "win32") {
		try {
			const requireFromRoot = createRequire(path.resolve(root, "package.json"));
			return requireFromRoot.resolve("next/dist/bin/next");
		} catch {
			// Fall back to the local .bin path for workspace layouts without resolvable bins.
		}
	}
	return path.resolve(
		root,
		"node_modules",
		".bin",
		process.platform === "win32" ? "next.cmd" : "next",
	);
}

async function runCommand(input: {
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
}): Promise<void> {
	const childEnv = buildChildEnvFromAllowlist();
	const result = await runProcess({
		command: input.command,
		args: input.args,
		cwd: input.cwd,
		env: childEnv,
		stdio: ["ignore", "pipe", "pipe"],
		timeoutMs: input.timeoutMs,
	});

	if (result.errorMessage) {
		throw new Error(result.errorMessage);
	}

	if (result.exitCode !== 0) {
		throw new Error(
			`${input.command} ${input.args.join(" ")} failed with code ${String(result.exitCode)}.\n${result.stdout}${result.stderr}`,
		);
	}
}

async function ensureRuntimeDeps(targetRoot: string): Promise<void> {
	const requireFromRoot = createRequire(path.resolve(targetRoot, "package.json"));
	const allInstalled = REQUIRED_NEXT_BUILD_PACKAGES.every((name) => {
		try {
			requireFromRoot.resolve(`${name}/package.json`);
			return true;
		} catch {
			return false;
		}
	});
	if (allInstalled) {
		return;
	}

	await runCommand({
		command: process.platform === "win32" ? "npm.cmd" : "npm",
		args: ["install", "--no-audit", "--no-fund"],
		cwd: targetRoot,
		timeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
	});
}

async function ensureNextBuild(targetRoot: string): Promise<void> {
	const buildOutputDir = await resolveNextBuildDir(targetRoot);
	const buildIdPath = path.resolve(buildOutputDir, "BUILD_ID");
	const appDir = path.resolve(targetRoot, "app");

	if (await pathExists(buildIdPath)) {
		const [buildStat, latestSourceMtimeMs] = await Promise.all([
			fs.stat(buildIdPath),
			getLatestMtimeMs(appDir),
		]);

		if (latestSourceMtimeMs <= buildStat.mtimeMs) {
			return;
		}
	}

	await fs.rm(buildOutputDir, {
		recursive: true,
		force: true,
	});

	await runCommand({
		command: getNextBinPath(targetRoot),
		args: ["build"],
		cwd: targetRoot,
		timeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
	});
}

async function getLatestMtimeMs(dirPath: string): Promise<number> {
	if (!(await pathExists(dirPath))) {
		return 0;
	}

	const stack = [dirPath];
	let latest = 0;

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.resolve(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}
			const stat = await fs.stat(entryPath);
			if (stat.mtimeMs > latest) {
				latest = stat.mtimeMs;
			}
		}
	}

	return latest;
}

async function terminateChild(child: ReturnType<typeof spawn>): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}

	child.kill("SIGTERM");
	await Promise.race([
		new Promise((resolve) => child.once("exit", resolve)),
		new Promise((resolve) => setTimeout(resolve, 1_500)),
	]);

	if (child.exitCode === null && child.signalCode === null) {
		child.kill("SIGKILL");
	}
}

async function captureScreenshot(input: {
	url: string;
	outputPath: string;
	viewport: { width: number; height: number };
	colorScheme: "light" | "dark";
}): Promise<void> {
	let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
	try {
		browser = await chromium.launch({ headless: true });
		const page = await browser.newPage({ viewport: input.viewport });
		await page.emulateMedia({ colorScheme: input.colorScheme });
		await page.goto(input.url, {
			waitUntil: "networkidle",
			timeout: DEFAULT_SCREENSHOT_TIMEOUT_MS,
		});
		await page.addStyleTag({
			content: `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
        }
      `,
		});
		await page.evaluate(async () => {
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => {
					requestAnimationFrame(() => resolve());
				});
			});
		});
		await page.screenshot({
			path: input.outputPath,
			fullPage: false,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/Executable doesn't exist|browser has not been found/i.test(message)) {
			throw new Error(`${message}\nRun: npx playwright install chromium`, {
				cause: error,
			});
		}
		throw error;
	} finally {
		if (browser) {
			await browser.close();
		}
	}
}

async function evaluateDarkVariation(input: {
	lightPath: string;
	darkPath: string;
	minDiffRatio: number;
}): Promise<{
	identical: boolean;
	diffPixels: number;
	diffRatio: number;
	meetsMinDiffRatio: boolean;
	message: string;
}> {
	const [lightBuffer, darkBuffer] = await Promise.all([
		fs.readFile(input.lightPath),
		fs.readFile(input.darkPath),
	]);
	const diff = comparePngBuffers({
		baselineBuffer: lightBuffer,
		actualBuffer: darkBuffer,
		thresholds: {
			maxDiffPixels: Number.MAX_SAFE_INTEGER,
			maxDiffRatio: 1,
			pixelmatchThreshold: DEFAULT_PIXELMATCH_THRESHOLD,
		},
	});
	const identical = diff.diffPixels === 0;
	const meetsMinDiffRatio = diff.diffRatio >= input.minDiffRatio;
	const summary = `dark diff ratio=${diff.diffRatio.toFixed(6)}, pixels=${String(diff.diffPixels)}, min=${input.minDiffRatio.toFixed(6)}`;
	return {
		identical,
		diffPixels: diff.diffPixels,
		diffRatio: diff.diffRatio,
		meetsMinDiffRatio,
		message: identical
			? `desktop-dark output is identical to desktop-light. Dark-mode regression coverage is effectively disabled (${summary}).`
			: meetsMinDiffRatio
				? `desktop-dark output differs from desktop-light (${summary}).`
				: `desktop-dark output differs, but variation is below required threshold (${summary}).`,
	};
}

function scenarioBaseName(id: string): string {
	return id === "desktop-light" ? "apps-web-home" : `apps-web-home.${id}`;
}

async function main(): Promise<void> {
	const options = parseCliOptions(process.argv.slice(2));
	const targetRoot = await resolveSafeTargetRoot(
		options.targetRoot || getDefaultAppRoot(),
	);
	const runId = resolveRuntimeRunId(process.env);
	const visualDir = path.resolve(
		".runtime-cache",
		"runs",
		runId,
		"artifacts",
		"visual",
	);
	const goldenDir = path.resolve("tests", "visual-golden");

	await fs.mkdir(visualDir, { recursive: true });
	await fs.mkdir(goldenDir, { recursive: true });

	const manifestStatus = await getTargetBuildManifestStatus({
		root: targetRoot,
		requiredPackages: REQUIRED_NEXT_BUILD_PACKAGES,
	});
	if (!manifestStatus.valid) {
		await ensureRuntimeDeps(targetRoot);
		await ensureNextBuild(targetRoot);
		await writeTargetBuildManifest({
			root: targetRoot,
			requiredPackages: REQUIRED_NEXT_BUILD_PACKAGES,
		});
	}

	const port = await findOpenPort();
	const serverUrl = `http://127.0.0.1:${port}/`;
	const childEnv = buildChildEnvFromAllowlist();
	const server = spawn(
		getNextBinPath(targetRoot),
		["start", "-p", String(port)],
		{
			cwd: targetRoot,
			env: {
				...childEnv,
				PORT: String(port),
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	try {
		await waitForHttpReady(serverUrl, DEFAULT_STARTUP_TIMEOUT_MS);
		for (const scenario of VISUAL_SCENARIOS) {
			const baseName = scenarioBaseName(scenario.id);
			await captureScreenshot({
				url: serverUrl,
				outputPath: path.resolve(visualDir, `${baseName}.actual.png`),
				viewport: scenario.viewport,
				colorScheme: scenario.colorScheme,
			});
		}
	} finally {
		await terminateChild(server);
	}

	const scenarioPaths = VISUAL_SCENARIOS.map((scenario) => {
		const baseName = scenarioBaseName(scenario.id);
		return {
			scenario: scenario.id,
			baselinePath: path.resolve(goldenDir, `${baseName}.png`),
			actualPath: path.resolve(visualDir, `${baseName}.actual.png`),
			diffPath: path.resolve(visualDir, `${baseName}.diff.png`),
		};
	});

	if (options.updateGolden) {
		for (const item of scenarioPaths) {
			await fs.copyFile(item.actualPath, item.baselinePath);
		}
		const output = {
			ok: true,
			updatedGolden: true,
			scenarios: scenarioPaths,
			message: "Updated visual goldens.",
		};
		process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
		return;
	}

	const missingBaselines: string[] = [];
	for (const item of scenarioPaths) {
		if (!(await pathExists(item.baselinePath))) {
			missingBaselines.push(item.baselinePath);
		}
	}
	if (missingBaselines.length > 0) {
		throw new Error(
			`Missing visual golden baseline(s). Run \`npm run visual:qa:update\` first.\n${missingBaselines.join("\n")}`,
		);
	}

	const scenarioResults: Array<{
		scenario: string;
		passed: boolean;
		baselinePath: string;
		actualPath: string;
		diffPath: string;
		diffPixels: number;
		diffRatio: number;
		reason: string;
	}> = [];
	for (const item of scenarioPaths) {
		const [baselineBuffer, actualBuffer] = await Promise.all([
			fs.readFile(item.baselinePath),
			fs.readFile(item.actualPath),
		]);
		const diff = comparePngBuffers({
			baselineBuffer,
			actualBuffer,
			thresholds: {
				maxDiffPixels: options.maxDiffPixels,
				maxDiffRatio: options.maxDiffRatio,
				pixelmatchThreshold: options.pixelmatchThreshold,
			},
		});
		if (diff.diffPngBuffer) {
			await fs.writeFile(item.diffPath, diff.diffPngBuffer);
		}
		scenarioResults.push({
			scenario: item.scenario,
			passed: diff.passed,
			baselinePath: item.baselinePath,
			actualPath: item.actualPath,
			diffPath: item.diffPath,
			diffPixels: diff.diffPixels,
			diffRatio: diff.diffRatio,
			reason: diff.reason,
		});
	}
	const passed = scenarioResults.every((item) => item.passed);

	const output = {
		ok: passed,
		scenarios: scenarioResults,
		darkVariation: {
			identical: false,
			diffPixels: 0,
			diffRatio: 0,
			minDiffRatio: VISUAL_QA_MIN_DARK_DIFF_RATIO,
			meetsMinDiffRatio: true,
			required: VISUAL_QA_REQUIRE_DARK_VARIATION,
			message: "dark variation check not evaluated",
		},
		maxDiffPixels: options.maxDiffPixels,
		maxDiffRatio: options.maxDiffRatio,
		pixelmatchThreshold: options.pixelmatchThreshold,
	};

	const desktopLight = scenarioPaths.find(
		(item) => item.scenario === "desktop-light",
	);
	const desktopDark = scenarioPaths.find(
		(item) => item.scenario === "desktop-dark",
	);
	if (desktopLight && desktopDark) {
		const darkVariation = await evaluateDarkVariation({
			lightPath: desktopLight.actualPath,
			darkPath: desktopDark.actualPath,
			minDiffRatio: VISUAL_QA_MIN_DARK_DIFF_RATIO,
		});
		output.darkVariation = {
			identical: darkVariation.identical,
			diffPixels: darkVariation.diffPixels,
			diffRatio: darkVariation.diffRatio,
			minDiffRatio: VISUAL_QA_MIN_DARK_DIFF_RATIO,
			meetsMinDiffRatio: darkVariation.meetsMinDiffRatio,
			required: VISUAL_QA_REQUIRE_DARK_VARIATION,
			message: darkVariation.message,
		};
		const insufficientDarkVariation =
			darkVariation.identical || !darkVariation.meetsMinDiffRatio;
		if (insufficientDarkVariation) {
			process.stderr.write(`[visual-qa] warning: ${darkVariation.message}\n`);
			if (VISUAL_QA_REQUIRE_DARK_VARIATION) {
				process.exitCode = 1;
				output.ok = false;
			}
		}
	}

	process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
	if (!passed) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`[visual-qa] fatal: ${message}\n`);
	process.exitCode = 1;
});
