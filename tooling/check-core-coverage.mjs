import { readFile, stat } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_SUMMARY_PATH =
	process.env.OPENUI_COVERAGE_SUMMARY_PATH?.trim() ||
	".runtime-cache/coverage/vitest/coverage-summary.json";
const SUMMARY_WAIT_TIMEOUT_MS = 90_000;
const SUMMARY_WAIT_INTERVAL_MS = 500;
const SUMMARY_MAX_AGE_MS = 15 * 60_000;
const DEFAULT_MUTATION_SUMMARY_PATH =
	process.env.OPENUI_MUTATION_SUMMARY_PATH?.trim() ||
	".runtime-cache/mutation/mutation-summary.json";
const DEFAULT_MUTATION_MIN_SCORE = 80;
const DEFAULT_MUTATION_MIN_TOTAL_BY_MODE = Object.freeze({
	full: 24,
	quick: 8,
});
const DEFAULT_MUTATION_MIN_MODULE_KILL_RATIO = 80;
const DEFAULT_MUTATION_MIN_OPERATOR_KILL_RATIO = 70;
const DEFAULT_MUTATION_ENFORCE_MIN_SAMPLES = true;
const MUTATION_SKIP_ENV = "OPENUI_ALLOW_MUTATION_SKIP";
const MUTATION_ENFORCE_MODULE_MIN_SAMPLES_ENV =
	"OPENUI_MUTATION_ENFORCE_MIN_SAMPLES";
const MUTATION_ENFORCE_OPERATOR_MIN_SAMPLES_ENV =
	"OPENUI_MUTATION_ENFORCE_OPERATOR_SAMPLES";
const COVERAGE_DOC_PATH = "docs/testing.md#21-core-coverage-contract";

function createThresholdBundle(minimum) {
	return Object.freeze({
		statements: minimum,
		functions: minimum,
		lines: minimum,
		branches: minimum,
	});
}

export const GLOBAL_THRESHOLDS = Object.freeze({
	statements: 95,
	functions: 95,
	lines: 95,
	branches: 95,
});

export const KEY_MODULE_THRESHOLDS = Object.freeze({
	"packages/shared-runtime/src/child-env.ts": createThresholdBundle(95),
	"packages/shared-runtime/src/job-queue.ts": createThresholdBundle(95),
	"packages/shared-runtime/src/path-utils.ts": createThresholdBundle(95),
	"services/mcp-server/src/tools/generate.ts": createThresholdBundle(95),
	"services/mcp-server/src/tools/refine.ts": createThresholdBundle(95),
});

function toPosixPath(value) {
	return String(value).replaceAll("\\", "/");
}

function normalizePath(value) {
	return toPosixPath(value).replace(/^\.\/+/, "");
}

function metricPct(metric, contextLabel, options = {}) {
	const { allowZeroTotal = false } = options;
	if (!metric || typeof metric !== "object") {
		return {
			ok: false,
			reason: `${contextLabel} is missing coverage metric data.`,
		};
	}
	const total = metric.total;
	const covered = metric.covered;
	if (!Number.isFinite(total) || !Number.isFinite(covered)) {
		return {
			ok: false,
			reason: `${contextLabel} has non-numeric total/covered values.`,
		};
	}
	if (total <= 0) {
		if (allowZeroTotal && total === 0) {
			if (covered === 0) {
				return {
					ok: true,
					value: 100,
				};
			}
			return {
				ok: false,
				reason: `${contextLabel} has invalid covered=${covered} for total=0.`,
			};
		}
		return {
			ok: false,
			reason: `${contextLabel} has total=${total}, expected > 0 to prevent empty-coverage bypass.`,
		};
	}
	if (covered < 0 || covered > total) {
		return {
			ok: false,
			reason: `${contextLabel} has invalid covered=${covered} for total=${total}.`,
		};
	}
	return {
		ok: true,
		value: (covered / total) * 100,
	};
}

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function parseWaitForFreshMsFromArgv(argv) {
	const prefix = "--wait-for-fresh-ms=";
	for (const arg of argv) {
		if (!arg.startsWith(prefix)) {
			continue;
		}
		const raw = arg.slice(prefix.length).trim();
		const parsed = Number(raw);
		if (!Number.isInteger(parsed) || parsed < 0) {
			return 0;
		}
		return parsed;
	}
	return 0;
}

function parseMutationOnlyFromArgv(argv) {
	return argv.includes("--mutation-only");
}

function parsePrintContractFromArgv(argv) {
	return argv.includes("--print-contract");
}

function buildCoverageContract() {
	return Object.freeze({
		global: GLOBAL_THRESHOLDS,
		keyModules: KEY_MODULE_THRESHOLDS,
		docs: COVERAGE_DOC_PATH,
	});
}

function readMutationMinScoreFromEnv() {
	const raw = Number(
		process.env.OPENUI_MUTATION_MIN_SCORE ?? DEFAULT_MUTATION_MIN_SCORE,
	);
	if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
		return DEFAULT_MUTATION_MIN_SCORE;
	}
	return raw;
}

function readBooleanEnv(name, fallback = false) {
	const raw = process.env[name]?.trim().toLowerCase();
	if (!raw) {
		return fallback;
	}
	return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function isCiEnvironment() {
	return readBooleanEnv("CI");
}

function canSkipMutationOnMissingSummary() {
	return readBooleanEnv(MUTATION_SKIP_ENV) && !isCiEnvironment();
}

function formatModuleSamplingSummary(moduleSampling) {
	if (!moduleSampling || typeof moduleSampling !== "object") {
		return null;
	}
	const status =
		typeof moduleSampling.status === "string"
			? moduleSampling.status
			: "unknown";
	const enforcement =
		typeof moduleSampling.enforcement === "string"
			? moduleSampling.enforcement
			: "unknown";
	const minSamplesPerModule = Number(moduleSampling.minSamplesPerModule);
	const deficits = Array.isArray(moduleSampling.deficits)
		? moduleSampling.deficits
		: [];
	const deficitPreview = deficits
		.map((item) => {
			if (!item || typeof item !== "object") {
				return "unknown";
			}
			const moduleName =
				typeof item.module === "string" ? item.module : "unknown-module";
			const actual = Number(item.actual);
			const required = Number(item.required);
			if (!Number.isFinite(actual) || !Number.isFinite(required)) {
				return moduleName;
			}
			return `${moduleName}=${actual}/${required}`;
		})
		.join(", ");
	const minDisplay = Number.isFinite(minSamplesPerModule)
		? String(minSamplesPerModule)
		: "unknown";
	const suffix = deficitPreview ? `; deficits=${deficitPreview}` : "";
	return `module sampling status=${status}; enforcement=${enforcement}; min=${minDisplay}${suffix}`;
}

async function readSummaryWithWait(path) {
	const deadline = Date.now() + SUMMARY_WAIT_TIMEOUT_MS;
	let lastError;

	while (Date.now() <= deadline) {
		try {
			const [content, fileStats] = await Promise.all([
				readFile(path, "utf8"),
				stat(path),
			]);
			return {
				content,
				mtimeMs: fileStats.mtimeMs,
			};
		} catch (error) {
			lastError = error;
			const code =
				error && typeof error === "object" && "code" in error
					? error.code
					: undefined;
			if (code !== "ENOENT") {
				throw error;
			}
			await sleep(SUMMARY_WAIT_INTERVAL_MS);
		}
	}

	throw lastError;
}

async function waitUntilSummaryFresh(path, maxAgeMs, waitForFreshMs) {
	if (waitForFreshMs <= 0) {
		return false;
	}

	const deadline = Date.now() + waitForFreshMs;
	while (Date.now() <= deadline) {
		try {
			const fileStats = await stat(path);
			if (Date.now() - fileStats.mtimeMs <= maxAgeMs) {
				return true;
			}
		} catch (error) {
			const code =
				error && typeof error === "object" && "code" in error
					? error.code
					: undefined;
			if (code !== "ENOENT") {
				throw error;
			}
		}
		await sleep(SUMMARY_WAIT_INTERVAL_MS);
	}
	return false;
}

function findCoverageEntry(summary, fileSuffix) {
	const normalizedSuffix = normalizePath(fileSuffix);
	const matches = [];
	for (const [filePath, metrics] of Object.entries(summary)) {
		if (filePath === "total" || !metrics) {
			continue;
		}
		const normalizedPath = normalizePath(filePath);
		if (
			normalizedPath === normalizedSuffix ||
			normalizedPath.endsWith(`/${normalizedSuffix}`)
		) {
			matches.push({
				filePath,
				metrics,
			});
		}
	}
	return matches;
}

function parseMutationScore(summary) {
	if (!summary || typeof summary !== "object") {
		return null;
	}
	const directCandidates = [
		summary.mutationScore,
		summary.score,
		summary.mutation?.score,
	];
	for (const candidate of directCandidates) {
		if (Number.isFinite(candidate)) {
			return Number(candidate);
		}
	}

	const killed = summary.total?.killed;
	const total = summary.total?.total;
	if (Number.isFinite(killed) && Number.isFinite(total) && total > 0) {
		return (Number(killed) / Number(total)) * 100;
	}

	return null;
}

function parseMutationTotal(summary) {
	const total = summary?.total?.total;
	if (!Number.isFinite(total)) {
		return null;
	}
	return Number(total);
}

function readMinMutationTotalForMode(mode) {
	const minFromMode = DEFAULT_MUTATION_MIN_TOTAL_BY_MODE[mode] ?? 1;
	const raw = Number(process.env.OPENUI_MUTATION_MIN_TOTAL ?? minFromMode);
	if (!Number.isFinite(raw) || raw < 1) {
		return minFromMode;
	}
	return Math.floor(raw);
}

function readMinMutationModuleKillRatio() {
	const raw = Number(
		process.env.OPENUI_MUTATION_MIN_MODULE_KILL_RATIO ??
			DEFAULT_MUTATION_MIN_MODULE_KILL_RATIO,
	);
	if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
		return DEFAULT_MUTATION_MIN_MODULE_KILL_RATIO;
	}
	return raw;
}

function readMinMutationOperatorKillRatio() {
	const raw = Number(
		process.env.OPENUI_MUTATION_MIN_OPERATOR_KILL_RATIO ??
			DEFAULT_MUTATION_MIN_OPERATOR_KILL_RATIO,
	);
	if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
		return DEFAULT_MUTATION_MIN_OPERATOR_KILL_RATIO;
	}
	return raw;
}

function validateMutationModuleStats(summary, minKillRatio) {
	const moduleStats =
		summary?.moduleStats && typeof summary.moduleStats === "object"
			? summary.moduleStats
			: null;
	const requiredModules = Object.keys(KEY_MODULE_THRESHOLDS);
	if (!moduleStats) {
		return {
			ok: false,
			message:
				"mutation summary missing moduleStats; cannot validate weak-module kill ratio.",
		};
	}
	const failures = [];
	for (const moduleName of requiredModules) {
		const stat = moduleStats[moduleName];
		if (!stat || typeof stat !== "object") {
			failures.push(`${moduleName}=missing`);
			continue;
		}
		const total = Number(stat.total);
		const killRatio = Number(stat.killRatio);
		if (!Number.isFinite(total) || total <= 0) {
			failures.push(`${moduleName}=invalid-total(${String(stat.total)})`);
			continue;
		}
		if (!Number.isFinite(killRatio)) {
			failures.push(
				`${moduleName}=invalid-killRatio(${String(stat.killRatio)})`,
			);
			continue;
		}
		if (killRatio + Number.EPSILON < minKillRatio) {
			failures.push(
				`${moduleName}=killRatio(${killRatio.toFixed(2)}%<${minKillRatio.toFixed(2)}%)`,
			);
		}
	}
	if (failures.length > 0) {
		return {
			ok: false,
			message: `mutation module kill-ratio gate failed: ${failures.join(", ")}`,
		};
	}
	return { ok: true, message: "mutation module kill-ratio gate passed" };
}

function validateMutationOperatorStats(summary, minKillRatio) {
	const operatorStats =
		summary?.operatorStats && typeof summary.operatorStats === "object"
			? summary.operatorStats
			: null;
	const requiredOperators = Array.isArray(
		summary?.operatorSampling?.requiredOperators,
	)
		? summary.operatorSampling.requiredOperators
		: [];
	if (!operatorStats) {
		return {
			ok: false,
			message:
				"mutation summary missing operatorStats; cannot validate operator-level kill ratio.",
		};
	}
	if (requiredOperators.length === 0) {
		return {
			ok: false,
			message:
				"mutation summary missing operatorSampling.requiredOperators; cannot validate operator coverage breadth.",
		};
	}
	const failures = [];
	for (const operatorName of requiredOperators) {
		const stat = operatorStats[operatorName];
		if (!stat || typeof stat !== "object") {
			failures.push(`${operatorName}=missing`);
			continue;
		}
		const total = Number(stat.total);
		const killRatio = Number(stat.killRatio);
		if (!Number.isFinite(total) || total <= 0) {
			failures.push(`${operatorName}=invalid-total(${String(stat.total)})`);
			continue;
		}
		if (!Number.isFinite(killRatio)) {
			failures.push(
				`${operatorName}=invalid-killRatio(${String(stat.killRatio)})`,
			);
			continue;
		}
		if (killRatio + Number.EPSILON < minKillRatio) {
			failures.push(
				`${operatorName}=killRatio(${killRatio.toFixed(2)}%<${minKillRatio.toFixed(2)}%)`,
			);
		}
	}
	if (failures.length > 0) {
		return {
			ok: false,
			message: `mutation operator kill-ratio gate failed: ${failures.join(", ")}`,
		};
	}
	return { ok: true, message: "mutation operator kill-ratio gate passed" };
}

async function checkMutationGate() {
	const minScore = readMutationMinScoreFromEnv();
	let mutationContent;
	try {
		mutationContent = await readFile(DEFAULT_MUTATION_SUMMARY_PATH, "utf8");
	} catch (error) {
		const code =
			error && typeof error === "object" && "code" in error
				? error.code
				: undefined;
		if (code === "ENOENT") {
			if (canSkipMutationOnMissingSummary()) {
				return {
					ok: true,
					message: `mutation summary missing at ${DEFAULT_MUTATION_SUMMARY_PATH}, skipped locally via ${MUTATION_SKIP_ENV}=1`,
				};
			}
			return {
				ok: false,
				message: `mutation summary not found at ${DEFAULT_MUTATION_SUMMARY_PATH}. Generate mutation report; for local temporary bypass only set ${MUTATION_SKIP_ENV}=1 (ignored in CI).`,
			};
		}
		const details = error instanceof Error ? error.message : String(error);
		return { ok: false, message: `cannot read mutation summary: ${details}` };
	}

	let mutationSummary;
	try {
		mutationSummary = JSON.parse(mutationContent);
	} catch (error) {
		const details = error instanceof Error ? error.message : String(error);
		return { ok: false, message: `invalid mutation summary JSON: ${details}` };
	}

	const mutationScore = parseMutationScore(mutationSummary);
	if (!Number.isFinite(mutationScore)) {
		return {
			ok: false,
			message:
				"mutation summary does not expose a parsable score (supported: mutationScore/score/mutation.score/total.killed+total.total).",
		};
	}
	if (mutationScore + Number.EPSILON < minScore) {
		return {
			ok: false,
			message: `mutation score ${mutationScore.toFixed(2)}% < ${minScore.toFixed(2)}%`,
		};
	}

	const mutationMode =
		typeof mutationSummary.mode === "string"
			? mutationSummary.mode.toLowerCase()
			: "full";
	const minTotal = readMinMutationTotalForMode(mutationMode);
	const mutationTotal = parseMutationTotal(mutationSummary);
	if (!Number.isFinite(mutationTotal)) {
		return {
			ok: false,
			message:
				"mutation summary missing total.total; cannot validate sample size floor.",
		};
	}
	if (mutationTotal < minTotal) {
		return {
			ok: false,
			message: `mutation sample size ${mutationTotal} < ${minTotal} for mode=${mutationMode}`,
		};
	}

	const moduleSamplingSummary = formatModuleSamplingSummary(
		mutationSummary.moduleSampling,
	);
	const enforceModuleSampling = readBooleanEnv(
		MUTATION_ENFORCE_MODULE_MIN_SAMPLES_ENV,
		DEFAULT_MUTATION_ENFORCE_MIN_SAMPLES,
	);
	if (
		enforceModuleSampling &&
		mutationSummary.moduleSampling?.status === "fail"
	) {
		const details = moduleSamplingSummary ? `; ${moduleSamplingSummary}` : "";
		return {
			ok: false,
			message: `mutation module sampling failed under default enforcement (${MUTATION_ENFORCE_MODULE_MIN_SAMPLES_ENV}=0 to downgrade locally)${details}`,
		};
	}

	const enforceOperatorSampling = readBooleanEnv(
		MUTATION_ENFORCE_OPERATOR_MIN_SAMPLES_ENV,
		DEFAULT_MUTATION_ENFORCE_MIN_SAMPLES,
	);
	if (
		enforceOperatorSampling &&
		mutationSummary.operatorSampling?.status === "fail"
	) {
		return {
			ok: false,
			message: `mutation operator sampling failed under default enforcement (${MUTATION_ENFORCE_OPERATOR_MIN_SAMPLES_ENV}=0 to downgrade locally)`,
		};
	}

	const minModuleKillRatio = readMinMutationModuleKillRatio();
	const moduleKillRatioCheck = validateMutationModuleStats(
		mutationSummary,
		minModuleKillRatio,
	);
	if (!moduleKillRatioCheck.ok) {
		return { ok: false, message: moduleKillRatioCheck.message };
	}

	const minOperatorKillRatio = readMinMutationOperatorKillRatio();
	const operatorKillRatioCheck = validateMutationOperatorStats(
		mutationSummary,
		minOperatorKillRatio,
	);
	if (!operatorKillRatioCheck.ok) {
		return { ok: false, message: operatorKillRatioCheck.message };
	}

	const samplingMessage = moduleSamplingSummary
		? `; ${moduleSamplingSummary}`
		: "";
	return {
		ok: true,
		message: `mutation score ${mutationScore.toFixed(2)}% >= ${minScore.toFixed(2)}%; total=${mutationTotal}/${minTotal}${samplingMessage}`,
	};
}

export async function main() {
	const waitForFreshMs = parseWaitForFreshMsFromArgv(process.argv.slice(2));
	const mutationOnly = parseMutationOnlyFromArgv(process.argv.slice(2));
	const printContract = parsePrintContractFromArgv(process.argv.slice(2));

	if (mutationOnly) {
		const mutationResult = await checkMutationGate();
		if (!mutationResult.ok) {
			process.stderr.write(
				`[coverage-core-gate] Mutation gate failed: ${mutationResult.message}\n`,
			);
			process.exit(1);
		}
		process.stdout.write(
			`[coverage-core-gate] Passed: ${mutationResult.message}.\n`,
		);
		return;
	}

	if (printContract) {
		process.stdout.write(
			`${JSON.stringify(buildCoverageContract(), null, 2)}\n`,
		);
		return;
	}

	let summaryContent;
	let summaryMtimeMs;
	try {
		const result = await readSummaryWithWait(DEFAULT_SUMMARY_PATH);
		summaryContent = result.content;
		summaryMtimeMs = result.mtimeMs;
	} catch (error) {
		const details = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`[coverage-core-gate] Cannot read ${DEFAULT_SUMMARY_PATH}. Run npm run test:coverage first. ${details}\n`,
		);
		process.exit(1);
	}

	if (Date.now() - summaryMtimeMs > SUMMARY_MAX_AGE_MS) {
		const refreshed = await waitUntilSummaryFresh(
			DEFAULT_SUMMARY_PATH,
			SUMMARY_MAX_AGE_MS,
			waitForFreshMs,
		);
		if (!refreshed) {
			process.stderr.write(
				`[coverage-core-gate] Coverage summary is stale (${DEFAULT_SUMMARY_PATH}). Re-run npm run test:coverage to refresh it.\n`,
			);
			process.exit(1);
		}
		const refreshedSummary = await readSummaryWithWait(DEFAULT_SUMMARY_PATH);
		summaryContent = refreshedSummary.content;
	}

	let summary;
	try {
		summary = JSON.parse(summaryContent);
	} catch (error) {
		const details = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`[coverage-core-gate] Invalid JSON in ${DEFAULT_SUMMARY_PATH}: ${details}\n`,
		);
		process.exit(1);
	}

	const failures = [];

	const total = summary.total;
	if (!total || typeof total !== "object") {
		failures.push(`Missing total coverage metrics in ${DEFAULT_SUMMARY_PATH}.`);
	} else {
		for (const [metricName, minimum] of Object.entries(GLOBAL_THRESHOLDS)) {
			const parsed = metricPct(total[metricName], `global ${metricName}`);
			if (!parsed.ok) {
				failures.push(parsed.reason);
				continue;
			}
			if (parsed.value + Number.EPSILON < minimum) {
				failures.push(
					`global ${metricName} ${parsed.value.toFixed(2)}% < ${minimum.toFixed(2)}%`,
				);
			}
		}
	}

	for (const [fileSuffix, threshold] of Object.entries(KEY_MODULE_THRESHOLDS)) {
		const matches = findCoverageEntry(summary, fileSuffix);
		if (matches.length === 0) {
			failures.push(
				`${fileSuffix} has no coverage entry in ${DEFAULT_SUMMARY_PATH} (expected exact file coverage).`,
			);
			continue;
		}
		if (matches.length > 1) {
			failures.push(
				`${fileSuffix} has ambiguous coverage entries (${matches.map((match) => match.filePath).join(", ")}).`,
			);
			continue;
		}
		const [{ metrics }] = matches;

		for (const [metricName, minimum] of Object.entries(threshold)) {
			const parsed = metricPct(
				metrics[metricName],
				`${fileSuffix} ${metricName}`,
				{
					allowZeroTotal: metricName === "branches",
				},
			);
			if (!parsed.ok) {
				failures.push(parsed.reason);
				continue;
			}
			if (parsed.value + Number.EPSILON < minimum) {
				failures.push(
					`${fileSuffix} ${metricName} ${parsed.value.toFixed(2)}% < ${minimum.toFixed(2)}%`,
				);
			}
		}
	}

	if (failures.length > 0) {
		process.stderr.write(
			"[coverage-core-gate] Coverage threshold check failed:\n",
		);
		for (const failure of failures) {
			process.stderr.write(`- ${failure}\n`);
		}
		process.exit(1);
	}

	process.stdout.write(
		`[coverage-core-gate] Passed: global statements/functions/lines/branches>=${GLOBAL_THRESHOLDS.statements.toFixed(0)}%; key modules>=95% (${Object.keys(KEY_MODULE_THRESHOLDS).length} modules, docs: ${COVERAGE_DOC_PATH}).\n`,
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await main();
}
