import process from "node:process";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultRunner, runCiGate } from "./ci-gate/core.mjs";
import { buildDefaultStages, DEFAULT_STAGES } from "./ci-gate/stages.mjs";
import {
	assertSummaryFilePathIsSafe,
	writeSummaryFile,
} from "./ci-gate/summary-file.mjs";
import { runEvidenceGovernanceCheck } from "./check-evidence-governance.mjs";
import { runRunCorrelationCheck } from "./check-run-correlation.mjs";
import { writeEvidenceIndex } from "./evidence-index.mjs";
import {
	DEFAULT_QUALITY_SCORE_BLOCKING_THRESHOLD,
	DEFAULT_QUALITY_SCORE_PATH,
	generateQualityScoreFromSummary,
	writeQualityScoreFile,
} from "./quality-score.mjs";
import { resolveRunLayout } from "./shared/run-layout.mjs";

// All ci:gate evidence is emitted under .runtime-cache/runs/<run_id>/summary.json,
// .runtime-cache/runs/<run_id>/quality-score.json, and evidence/index.json.

const QUALITY_SCORE_BYPASS_ENV = "OPENUI_ALLOW_QUALITY_SCORE_BYPASS";
const QUALITY_SCORE_MIN_ENV = "OPENUI_QUALITY_SCORE_MIN";

function parseQualityScoreThresholdFromEnv(env = process.env) {
	const raw = env?.[QUALITY_SCORE_MIN_ENV]?.trim();
	if (!raw) {
		return DEFAULT_QUALITY_SCORE_BLOCKING_THRESHOLD;
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		return DEFAULT_QUALITY_SCORE_BLOCKING_THRESHOLD;
	}
	return Math.max(0, Math.min(100, parsed));
}

function isQualityScoreBypassEnabled(env = process.env) {
	if (env.CI === "true" || env.CI === "1") {
		return false;
	}
	const raw = env?.[QUALITY_SCORE_BYPASS_ENV];
	if (raw === undefined || raw === null) {
		return false;
	}
	return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

async function runQualityScoreGate(options) {
	const {
		summary,
		summaryPath,
		qualityScorePath = DEFAULT_QUALITY_SCORE_PATH,
		threshold = parseQualityScoreThresholdFromEnv(),
		bypass = isQualityScoreBypassEnabled(),
		generateReport = generateQualityScoreFromSummary,
		writeReport = writeQualityScoreFile,
	} = options;

	try {
		const report = generateReport(summary, { summaryPath });
		await writeReport(qualityScorePath, report);
		const overallScore = Number(report?.overall?.score);
		if (!Number.isFinite(overallScore)) {
			const reason = "quality score missing or invalid in generated report";
			return bypass
				? {
						ok: true,
						bypassed: true,
						reason: "invalid_score_bypassed",
						detail: reason,
						threshold,
						score: null,
					}
				: {
						ok: false,
						bypassed: false,
						reason: "invalid_score",
						detail: reason,
						threshold,
						score: null,
					};
		}
		if (overallScore < threshold) {
			const detail = `quality score ${overallScore} < threshold ${threshold}`;
			return bypass
				? {
						ok: true,
						bypassed: true,
						reason: "below_threshold_bypassed",
						detail,
						threshold,
						score: overallScore,
					}
				: {
						ok: false,
						bypassed: false,
						reason: "below_threshold",
						detail,
						threshold,
						score: overallScore,
					};
		}

		return {
			ok: true,
			bypassed: false,
			reason: "passed",
			detail: `quality score ${overallScore} >= threshold ${threshold}`,
			threshold,
			score: overallScore,
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return bypass
			? {
					ok: true,
					bypassed: true,
					reason: "generation_failed_bypassed",
					detail,
					threshold,
					score: null,
				}
			: {
					ok: false,
					bypassed: false,
					reason: "generation_failed",
					detail,
					threshold,
					score: null,
				};
	}
}

function parseCliArgs(argv) {
	let summaryFile = process.env.CI_GATE_SUMMARY_PATH ?? "";
	let enforceExternalReadonly = false;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--summary-file") {
			const nextValue = argv[index + 1];
			if (!nextValue) {
				throw new Error("--summary-file requires a file path.");
			}
			summaryFile = nextValue;
			index += 1;
			continue;
		}
		if (argument.startsWith("--summary-file=")) {
			summaryFile = argument.slice("--summary-file=".length);
			continue;
		}
		if (argument === "--enforce-external-readonly") {
			enforceExternalReadonly = true;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}

	const normalizedSummaryFile = summaryFile.trim();
	if (normalizedSummaryFile) {
		assertSummaryFilePathIsSafe(normalizedSummaryFile);
	}

	return {
		summaryFile: normalizedSummaryFile,
		enforceExternalReadonly,
	};
}

function applyQualityScoreGateToSummary(summary, qualityScoreGate) {
	const nextSummary = {
		...summary,
		qualityScoreGate,
	};

	if (nextSummary.ok && !qualityScoreGate.ok) {
		nextSummary.ok = false;
		nextSummary.exitCode = 1;
	}

	return nextSummary;
}

function applyRunMetadataToSummary(summary, runId) {
	return {
		...summary,
		runId,
	};
}

function appendBlockingGovernanceFailure(summary, failure) {
	return {
		...summary,
		ok: false,
		exitCode: 1,
		stages: [
			...summary.stages,
			{
				id: "postRunGovernance",
				name: "Post-Run Evidence Governance",
				status: "failed",
				durationMs: 0,
				warningCount: 0,
				tasks: [
					{
						id: failure.id,
						command: failure.command,
						category: "infra",
						advisory: false,
						status: "failed",
						exitCode: 1,
						durationMs: 0,
						stdout: "",
						stderr: failure.stderr,
						hint: failure.hint,
					},
				],
			},
		],
	};
}

function isDirectExecution() {
	if (!process.argv[1]) {
		return false;
	}
	return import.meta.url === pathToFileURL(process.argv[1]).href;
}

async function initializeRunLayout(layout, commandArgs) {
	const requiredDirectories = [
		layout.metaRootRelative,
		layout.logRootRelative,
		layout.artifactRootRelative,
		layout.evidenceRootRelative,
	];
	for (const relativePath of requiredDirectories) {
		await mkdir(path.resolve(process.cwd(), relativePath), { recursive: true });
	}
	for (const relativeLogPath of Object.values(layout.logPathsByChannel)) {
		const absoluteLogPath = path.resolve(process.cwd(), relativeLogPath);
		await mkdir(path.dirname(absoluteLogPath), { recursive: true });
		await writeFile(absoluteLogPath, "", "utf8");
	}
	const runManifestPath = path.resolve(
		process.cwd(),
		layout.runManifestPathRelative,
	);
	await writeFile(
		runManifestPath,
		`${JSON.stringify(
			{
				version: 1,
				runId: layout.runId,
				authoritative: true,
				mode: "ci-gate",
				command: `node tooling/ci-gate.mjs${commandArgs.length > 0 ? ` ${commandArgs.join(" ")}` : ""}`,
				createdAt: new Date().toISOString(),
				workspaceRoot: process.cwd(),
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
}

async function writeCiLifecycleLog(layout, payload) {
	const targetPath = path.resolve(process.cwd(), layout.logPathsByChannel.ci);
	await mkdir(path.dirname(targetPath), { recursive: true });
	await writeFile(targetPath, `${JSON.stringify(payload)}\n`, "utf8");
}

if (isDirectExecution()) {
	try {
		process.env.OPENUI_CI_GATE_RUN_KEY =
			process.env.OPENUI_CI_GATE_RUN_KEY?.trim() ||
			`ci-gate-${Date.now()}-${process.pid}`;
		const runId = process.env.OPENUI_CI_GATE_RUN_KEY;
		const layout = await resolveRunLayout({ runId });
		const cliArgs = process.argv.slice(2);
		const { summaryFile, enforceExternalReadonly } = parseCliArgs(cliArgs);
		await initializeRunLayout(layout, cliArgs);
		const finalSummaryPath = summaryFile || layout.summaryPathRelative;
		const finalQualityScorePath = layout.qualityScorePathRelative;
		let summary = await runCiGate({
			stages: buildDefaultStages({
				enforceExternalReadonly,
			}),
		});
		summary = applyRunMetadataToSummary(summary, runId);
		const qualityScoreGate = await runQualityScoreGate({
			summary,
			summaryPath: finalSummaryPath,
			qualityScorePath: finalQualityScorePath,
		});
		summary = applyQualityScoreGateToSummary(summary, qualityScoreGate);
		await writeSummaryFile(finalSummaryPath, summary);
		await writeCiLifecycleLog(layout, {
			ts: new Date().toISOString(),
			level: summary.ok ? "info" : "error",
			event: "ci_gate_completed",
			runId,
			traceId: runId,
			requestId: runId,
			service: "ci-gate",
			component: "tooling",
			stage: "ci",
			context: {
				ok: summary.ok,
				exitCode: summary.exitCode,
				summaryPath: finalSummaryPath,
				qualityScorePath: finalQualityScorePath,
			},
		});
		await writeEvidenceIndex({
			rootDir: process.cwd(),
			summary,
			summaryPath: finalSummaryPath,
			qualityScorePath: finalQualityScorePath,
			runId,
		});
		const evidenceCheck = await runEvidenceGovernanceCheck({
			rootDir: process.cwd(),
			runId,
		});
		if (!evidenceCheck.ok) {
			summary = appendBlockingGovernanceFailure(summary, {
				id: "governanceEvidence",
				command: "npm run -s governance:evidence:check",
				stderr: `[evidence-governance] FAILED\n${evidenceCheck.errors.map((item) => `- ${item}`).join("\n")}`,
				hint: "Fix evidence bundle completeness and rerun ci:gate.",
			});
			await writeSummaryFile(finalSummaryPath, summary);
		}
		const runCorrelationCheck = await runRunCorrelationCheck({
			rootDir: process.cwd(),
			runId,
		});
		if (!runCorrelationCheck.ok) {
			summary = appendBlockingGovernanceFailure(summary, {
				id: "governanceRunCorrelation",
				command: "npm run -s governance:run-correlation:check",
				stderr: `[run-correlation] FAILED\n${runCorrelationCheck.errors.map((item) => `- ${item}`).join("\n")}`,
				hint: "Fix run-scoped log correlation and rerun ci:gate.",
			});
			await writeSummaryFile(finalSummaryPath, summary);
		}
		await writeEvidenceIndex({
			rootDir: process.cwd(),
			summary,
			summaryPath: finalSummaryPath,
			qualityScorePath: finalQualityScorePath,
			runId,
		});
		if (!qualityScoreGate.ok) {
			process.stderr.write(
				`[ci:gate][error] quality-score gate failed: ${qualityScoreGate.detail}\n`,
			);
		} else if (qualityScoreGate.bypassed) {
			process.stderr.write(
				`[ci:gate][warning] quality-score gate bypassed by ${QUALITY_SCORE_BYPASS_ENV}=1: ${qualityScoreGate.detail}\n`,
			);
		}
		if (summary.warningCount > 0) {
			for (const warning of summary.warnings) {
				process.stderr.write(
					`[ci:gate][warning] advisory-only task failed (non-blocking): ${warning.taskId} (${warning.command}) in ${warning.stageId}\n`,
				);
				process.stderr.write(
					"[ci:gate][notice] ci:gate pass/fail is decided by blocking tasks (for coverage: coreCoverageGate).\n",
				);
				if (warning.hint) {
					process.stderr.write(`[ci:gate][hint] ${warning.hint}\n`);
				}
			}
		}
		process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
		process.exitCode = summary.exitCode;
	} catch (error) {
		process.stderr.write(
			`ci-gate runtime error: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 2;
	}
}

export {
	DEFAULT_STAGES,
	buildDefaultStages,
	createDefaultRunner,
	isQualityScoreBypassEnabled,
	parseQualityScoreThresholdFromEnv,
	runQualityScoreGate,
	runCiGate,
	writeSummaryFile,
	applyQualityScoreGateToSummary,
};
