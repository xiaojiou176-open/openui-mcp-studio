import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
	buildRetryDelayMs,
	clampOutput,
	classifyRetryReason,
	classifyScriptFailure,
	createLiveTestError,
	DEFAULT_LIVE_TEST_ATTEMPT_TIMEOUT_MS,
	DEFAULT_LIVE_TEST_MAX_OUTPUT_BYTES,
	DEFAULT_LIVE_TEST_RETRY_BASE_DELAY_MS,
	DEFAULT_LIVE_TEST_RETRY_MAX_DELAY_MS,
	emitLiveTestLog,
	findEvidenceSnippet,
	getRecommendedAction,
	LIVE_TEST_ERROR_CODES,
	looksLikePlaceholderGeminiKey,
	redactSensitiveOutput,
	sleepWithHeartbeatSync,
	terminateHeartbeat,
} from "./live-tests/runtime-helpers.mjs";

const LIVE_TEST_FILE = "tests/live-gemini-smoke.test.ts";
const ENV_FILE_CANDIDATES = [".env"];
const DEFAULT_LIVE_TEST_MAX_RETRIES = 2;
const MAX_LIVE_TEST_RETRIES = 2;
const DEFAULT_LIVE_TEST_HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_SCRIPT_PATH = path.resolve("tooling/test-heartbeat.mjs");

export function parseEnvLikeContent(content) {
	const parsed = {};
	const lines = content.split(/\r?\n/u);

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const normalized = trimmed.startsWith("export ")
			? trimmed.slice("export ".length).trim()
			: trimmed;
		const equalsIndex = normalized.indexOf("=");
		if (equalsIndex <= 0) {
			continue;
		}

		const key = normalized.slice(0, equalsIndex).trim();
		const rawValue = normalized.slice(equalsIndex + 1).trim();
		const unquoted = rawValue.replace(/^["']|["']$/gu, "").trim();
		parsed[key] = unquoted;
	}

	return parsed;
}

export function readGeminiApiKeyFromEnvFiles({
	cwd = process.cwd(),
	readTextFile = (filePath) => readFileSync(filePath, "utf8"),
} = {}) {
	for (const candidate of ENV_FILE_CANDIDATES) {
		try {
			const content = readTextFile(path.join(cwd, candidate));
			const parsed = parseEnvLikeContent(content);
			const key = parsed.GEMINI_API_KEY?.trim();
			if (key) {
				return key;
			}
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				continue;
			}
			throw error;
		}
	}

	return "";
}

export function readGeminiApiKeyFromZsh({ run = spawnSync } = {}) {
	const result = run("zsh", ["-lic", "printenv GEMINI_API_KEY"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (result.error?.code === "ENOENT") {
		return "";
	}
	if (result.error) {
		throw result.error;
	}
	if (typeof result.status === "number" && result.status !== 0) {
		return "";
	}

	return result.stdout?.trim() ?? "";
}

export function resolveGeminiApiKey({
	env = process.env,
	cwd = process.cwd(),
	readTextFile,
	run = spawnSync,
} = {}) {
	const existing = env.GEMINI_API_KEY?.trim();
	if (existing) {
		return { source: "process.env", key: existing };
	}

	const fromFiles = readGeminiApiKeyFromEnvFiles({ cwd, readTextFile });
	if (fromFiles) {
		return { source: "env-file", key: fromFiles };
	}

	const fromZsh = readGeminiApiKeyFromZsh({ run });
	if (fromZsh) {
		return { source: "zsh-login-shell", key: fromZsh };
	}

	return { source: "missing", key: "" };
}

export function buildMissingKeyMessage() {
	return [
		"GEMINI_API_KEY is required for live tests but was not found.",
		"Resolution order: process.env -> .env -> zsh login shell (`printenv GEMINI_API_KEY`).",
		"Set GEMINI_API_KEY in one of these locations and retry `npm run test:live`.",
	].join("\n");
}

export function runLiveGeminiSmoke({
	env = process.env,
	cwd = process.cwd(),
	readTextFile,
	run = spawnSync,
	spawnProcess = spawn,
	inheritStdio = "inherit",
	sleepWithHeartbeat = sleepWithHeartbeatSync,
} = {}) {
	const resolved = resolveGeminiApiKey({ env, cwd, readTextFile, run });
	if (!resolved.key) {
		throw createLiveTestError(
			buildMissingKeyMessage(),
			LIVE_TEST_ERROR_CODES.KEY_MISSING,
			getRecommendedAction(LIVE_TEST_ERROR_CODES.KEY_MISSING),
		);
	}
	if (looksLikePlaceholderGeminiKey(resolved.key)) {
		throw createLiveTestError(
			"GEMINI_API_KEY appears to be a placeholder or test token; live tests require a real key.",
			LIVE_TEST_ERROR_CODES.KEY_PLACEHOLDER,
			getRecommendedAction(LIVE_TEST_ERROR_CODES.KEY_PLACEHOLDER),
		);
	}

	env.GEMINI_API_KEY = resolved.key;
	env.OPENUI_ENABLE_LIVE_GEMINI_SMOKE = "1";
	env.OPENUI_LIVE_TEST_RUN_ID =
		env.OPENUI_LIVE_TEST_RUN_ID?.trim() || `${Date.now()}`;
	const traceId = env.OPENUI_LIVE_TEST_RUN_ID;

	const hasRetriesEnv = env.LIVE_TEST_MAX_RETRIES !== undefined;
	let requestedRetriesRaw = DEFAULT_LIVE_TEST_MAX_RETRIES;
	if (hasRetriesEnv) {
		requestedRetriesRaw = env.LIVE_TEST_MAX_RETRIES;
	}
	const parsedRetries = Number(requestedRetriesRaw);
	const maxRetries = Number.isInteger(parsedRetries)
		? Math.min(MAX_LIVE_TEST_RETRIES, Math.max(0, parsedRetries))
		: DEFAULT_LIVE_TEST_MAX_RETRIES;
	if (Number.isInteger(parsedRetries) && parsedRetries !== maxRetries) {
		console.error(
			`[live-test] LIVE_TEST_MAX_RETRIES clamped from ${parsedRetries} to ${maxRetries} (policy max=${MAX_LIVE_TEST_RETRIES}).`,
		);
	}
	const maxAttempts = maxRetries + 1;
	const heartbeatIntervalRaw = Number(
		env.LIVE_TEST_HEARTBEAT_INTERVAL_MS ??
			DEFAULT_LIVE_TEST_HEARTBEAT_INTERVAL_MS,
	);
	const heartbeatIntervalMs =
		Number.isInteger(heartbeatIntervalRaw) && heartbeatIntervalRaw > 0
			? heartbeatIntervalRaw
			: DEFAULT_LIVE_TEST_HEARTBEAT_INTERVAL_MS;
	const retryBaseDelayRaw = Number(
		env.LIVE_TEST_RETRY_BASE_DELAY_MS ?? DEFAULT_LIVE_TEST_RETRY_BASE_DELAY_MS,
	);
	const retryBaseDelayMs =
		Number.isInteger(retryBaseDelayRaw) && retryBaseDelayRaw >= 0
			? retryBaseDelayRaw
			: DEFAULT_LIVE_TEST_RETRY_BASE_DELAY_MS;
	const retryMaxDelayRaw = Number(
		env.LIVE_TEST_RETRY_MAX_DELAY_MS ?? DEFAULT_LIVE_TEST_RETRY_MAX_DELAY_MS,
	);
	const retryMaxDelayMs =
		Number.isInteger(retryMaxDelayRaw) && retryMaxDelayRaw > 0
			? retryMaxDelayRaw
			: DEFAULT_LIVE_TEST_RETRY_MAX_DELAY_MS;
	const attemptTimeoutRaw = Number(
		env.LIVE_TEST_ATTEMPT_TIMEOUT_MS ?? DEFAULT_LIVE_TEST_ATTEMPT_TIMEOUT_MS,
	);
	const attemptTimeoutMs =
		Number.isInteger(attemptTimeoutRaw) && attemptTimeoutRaw > 0
			? attemptTimeoutRaw
			: DEFAULT_LIVE_TEST_ATTEMPT_TIMEOUT_MS;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const startedAt = Date.now();
		console.error(
			`[live-test] attempt ${attempt}/${maxAttempts} started (key source: ${resolved.source}, file: ${LIVE_TEST_FILE})`,
		);
		emitLiveTestLog(
			"info",
			"live_test_attempt_started",
			{
				stage: "attempt_start",
				attempt,
				maxAttempts,
				maxRetries,
				keySource: resolved.source,
				testFile: LIVE_TEST_FILE,
			},
			traceId,
		);

		const heartbeatProcess = spawnProcess(
			process.execPath,
			[
				HEARTBEAT_SCRIPT_PATH,
				`--label=live-test:attempt-${attempt}`,
				`--interval-ms=${heartbeatIntervalMs}`,
			],
			{ cwd, env, stdio: ["ignore", inheritStdio, inheritStdio] },
		);
		heartbeatProcess.unref?.();
		let result;
		try {
			result = run(
				process.execPath,
				["./node_modules/vitest/vitest.mjs", "run", LIVE_TEST_FILE],
				{
					cwd,
					env,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
					maxBuffer: DEFAULT_LIVE_TEST_MAX_OUTPUT_BYTES,
					timeout: attemptTimeoutMs,
				},
			);
		} finally {
			terminateHeartbeat(heartbeatProcess, { traceId });
		}

		if (result.error) {
			if (result.error.code === "ETIMEDOUT") {
				const timeoutMessage = [
					`[live-test] vitest subprocess timed out after ${attemptTimeoutMs}ms.`,
					"Set LIVE_TEST_ATTEMPT_TIMEOUT_MS to a higher value if the timeout is expected.",
				].join(" ");
				result = {
					status: 124,
					stdout: result.stdout ?? "",
					stderr: `${result.stderr ?? ""}\n${timeoutMessage}`,
				};
			} else {
				throw createLiveTestError(
					`live test subprocess execution failed: ${result.error.message}`,
					LIVE_TEST_ERROR_CODES.UNKNOWN,
					getRecommendedAction(LIVE_TEST_ERROR_CODES.UNKNOWN),
					result.error,
				);
			}
		}

		const rawStdout = clampOutput(
			result.stdout ?? "",
			DEFAULT_LIVE_TEST_MAX_OUTPUT_BYTES,
		);
		const rawStderr = clampOutput(
			result.stderr ?? "",
			DEFAULT_LIVE_TEST_MAX_OUTPUT_BYTES,
		);
		const stdout = redactSensitiveOutput(rawStdout);
		const stderr = redactSensitiveOutput(rawStderr);
		if (stdout) {
			process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
		}
		if (stderr) {
			process.stderr.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
		}

		const elapsedSeconds = Math.max(
			1,
			Math.round((Date.now() - startedAt) / 1000),
		);
		const statusCode = result.status ?? 1;

		if (statusCode === 0) {
			console.log(
				`[live-test] attempt ${attempt}/${maxAttempts} passed in ${elapsedSeconds}s`,
			);
			emitLiveTestLog(
				"info",
				"live_test_attempt_passed",
				{
					stage: "attempt_complete",
					attempt,
					maxAttempts,
					maxRetries,
					statusCode,
					elapsedSeconds,
				},
				traceId,
			);
			return 0;
		}

		const shouldRetry = attempt < maxAttempts;
		const combinedOutput = `${stdout}\n${stderr}`;
		const retryDecision = classifyRetryReason({
			output: combinedOutput,
			exitCode: statusCode,
		});
		const failureEvidence = {
			type: retryDecision.type,
			retryable: retryDecision.retryable,
			traceId,
			durationMs: elapsedSeconds * 1000,
			statusCode,
			attempt,
			maxAttempts,
			maxRetries,
			reason: retryDecision.reason,
			errorCode: retryDecision.errorCode,
			recommendedAction: retryDecision.recommendedAction,
			evidenceSnippet: findEvidenceSnippet(combinedOutput),
		};
		console.error(
			`[live-test] attempt ${attempt}/${maxAttempts} failed with status=${statusCode} in ${elapsedSeconds}s`,
		);
		console.error(
			`[live-test][failure-evidence] ${JSON.stringify(failureEvidence)}`,
		);
		emitLiveTestLog(
			"warn",
			"live_test_attempt_failed",
			{
				stage: "attempt_complete",
				attempt,
				maxAttempts,
				maxRetries,
				statusCode,
				elapsedSeconds,
				errorType: retryDecision.type,
				errorCode: retryDecision.errorCode,
				retryable: retryDecision.retryable,
				retryReason: retryDecision.reason,
				recommendedAction: retryDecision.recommendedAction,
			},
			traceId,
		);

		if (!shouldRetry || !retryDecision.retryable) {
			if (!retryDecision.retryable) {
				console.error(
					`[live-test] retry skipped: ${retryDecision.reason} (type=${retryDecision.type}).`,
				);
				emitLiveTestLog(
					"warn",
					"live_test_retry_skipped",
					{
						stage: "retry_decision",
						attempt,
						maxAttempts,
						maxRetries,
						statusCode,
						errorType: retryDecision.type,
						errorCode: retryDecision.errorCode,
						retryReason: retryDecision.reason,
						recommendedAction: retryDecision.recommendedAction,
					},
					traceId,
				);
			} else {
				const maxAttemptsErrorCode = LIVE_TEST_ERROR_CODES.MAX_ATTEMPTS_REACHED;
				const maxAttemptsRecommendedAction =
					getRecommendedAction(maxAttemptsErrorCode);
				console.error("[live-test] retry skipped: reached max attempts.");
				console.error(
					`[live-test][failure-evidence] ${JSON.stringify({
						type: "max_attempts_reached",
						retryable: false,
						traceId,
						durationMs: elapsedSeconds * 1000,
						statusCode,
						attempt,
						maxAttempts,
						maxRetries,
						reason: "reached max attempts",
						errorCode: maxAttemptsErrorCode,
						recommendedAction: maxAttemptsRecommendedAction,
						evidenceSnippet: findEvidenceSnippet(combinedOutput),
					})}`,
				);
				emitLiveTestLog(
					"warn",
					"live_test_retry_skipped",
					{
						stage: "retry_decision",
						attempt,
						maxAttempts,
						maxRetries,
						statusCode,
						errorType: "max_attempts_reached",
						errorCode: maxAttemptsErrorCode,
						retryReason: "reached max attempts",
						recommendedAction: maxAttemptsRecommendedAction,
					},
					traceId,
				);
			}
			return statusCode;
		}
		const retryDelayMs = buildRetryDelayMs(
			retryBaseDelayMs,
			attempt,
			retryMaxDelayMs,
		);
		console.error(
			`[live-test] retrying after ${retryDelayMs}ms: ${retryDecision.reason} (type=${retryDecision.type}).`,
		);
		emitLiveTestLog(
			"info",
			"live_test_retry_scheduled",
			{
				stage: "retry_decision",
				attempt,
				maxAttempts,
				maxRetries,
				statusCode,
				retryDelayMs,
				errorType: retryDecision.type,
				errorCode: retryDecision.errorCode,
				retryReason: retryDecision.reason,
				recommendedAction: retryDecision.recommendedAction,
				nextAttempt: attempt + 1,
			},
			traceId,
		);
		const backoffHeartbeatTickMs = Math.min(
			5_000,
			Math.max(1_000, retryDelayMs),
		);
		sleepWithHeartbeat(retryDelayMs, {
			tickMs: backoffHeartbeatTickMs,
			onTick: ({ totalMs, elapsedMs, remainingMs }) => {
				emitLiveTestLog(
					"info",
					"live_test_retry_backoff_heartbeat",
					{
						stage: "retry_backoff",
						attempt,
						maxAttempts,
						maxRetries,
						totalBackoffMs: totalMs,
						elapsedBackoffMs: elapsedMs,
						remainingBackoffMs: remainingMs,
					},
					traceId,
				);
			},
		});
	}

	return 1;
}

function main() {
	try {
		const status = runLiveGeminiSmoke();
		process.exit(status);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const traceId =
			process.env.OPENUI_LIVE_TEST_RUN_ID?.trim() || "live_test_missing_trace";
		const errorType = error instanceof Error ? error.name : "UnknownError";
		const { errorCode, recommendedAction } = classifyScriptFailure({
			error,
			message,
		});
		console.error(
			`[live-test] script failed (type=${errorType}, error_code=${errorCode}, traceId=${traceId}): ${message}`,
		);
		console.error(
			`[live-test][failure-evidence] ${JSON.stringify({
				type: "script_failure",
				retryable: false,
				traceId,
				durationMs: 0,
				reason: "live test script failure before successful completion",
				errorCode,
				recommendedAction,
				evidenceSnippet: findEvidenceSnippet(message),
			})}`,
		);
		emitLiveTestLog(
			"error",
			"live_test_script_failed",
			{
				stage: "script_main",
				errorType,
				errorCode,
				recommendedAction,
				context: {
					script: "tooling/run-live-tests.mjs",
				},
				error: message,
			},
			traceId,
		);
		process.exit(1);
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main();
}
