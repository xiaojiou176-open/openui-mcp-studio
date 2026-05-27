const DEFAULT_LIVE_TEST_MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_LIVE_TEST_RETRY_BASE_DELAY_MS = 2_000;
const DEFAULT_LIVE_TEST_RETRY_MAX_DELAY_MS = 15_000;
const DEFAULT_LIVE_TEST_ATTEMPT_TIMEOUT_MS = 180_000;
const DEFAULT_HEARTBEAT_EXIT_TIMEOUT_MS = 1_500;
const DEFAULT_HEARTBEAT_SIGKILL_CONFIRM_WINDOW_MS = 250;
const DEFAULT_HEARTBEAT_SIGKILL_CONFIRM_POLL_MS = 25;

const SUBPROCESS_TIMEOUT_PATTERN =
	/(?:vitest|live-test)\s+subprocess\s+timed\s+out|spawnsync.*etimedout/i;
const TRANSIENT_ERROR_PATTERN =
	/timeout|timed out|etimedout|timedout|econnreset|enotfound|eai_again|network|socket|rate limit|429|500|502|503|504|service unavailable|temporar(?:y|ily)|unavailable/i;
const NON_TRANSIENT_ERROR_PATTERN =
	/assert(?:ion)?error|expected .* to|snapshot|syntaxerror|typeerror|referenceerror|vitest.*failed/i;
const AUTH_ERROR_PATTERN =
	/unauthorized|forbidden|invalid api key|api key is invalid|permission denied|insufficient permissions?|(?:http|status)(?:\s*code)?\s*[:=]?\s*40[13]|\b40[13]\b\s*(?:unauthorized|forbidden)/i;
const PLACEHOLDER_KEY_PATTERN =
	/^(?:your[_-]?key|example|test|placeholder|changeme|replace[_-]?me)$/i;
const LIVE_TEST_ERROR_CODES = Object.freeze({
	KEY_MISSING: "LIVE_KEY_MISSING",
	KEY_PLACEHOLDER: "LIVE_KEY_PLACEHOLDER",
	NETWORK_TRANSIENT: "LIVE_NETWORK_TRANSIENT",
	SUBPROCESS_TIMEOUT: "LIVE_SUBPROCESS_TIMEOUT",
	AUTH_PERMISSION: "LIVE_AUTH_PERMISSION",
	ASSERTION_RUNTIME: "LIVE_ASSERTION_RUNTIME",
	MAX_ATTEMPTS_REACHED: "LIVE_MAX_ATTEMPTS_REACHED",
	UNKNOWN: "LIVE_UNKNOWN",
});

const LIVE_TEST_RECOMMENDED_ACTIONS = Object.freeze({
	[LIVE_TEST_ERROR_CODES.KEY_MISSING]:
		"Set GEMINI_API_KEY via process.env, .env, or zsh login shell, then rerun `npm run test:live`.",
	[LIVE_TEST_ERROR_CODES.KEY_PLACEHOLDER]:
		"Replace placeholder GEMINI_API_KEY with a real live key and rerun `npm run test:live`.",
	[LIVE_TEST_ERROR_CODES.NETWORK_TRANSIENT]:
		"Retry later or check upstream/network health; keep retry policy enabled for transient failures.",
	[LIVE_TEST_ERROR_CODES.SUBPROCESS_TIMEOUT]:
		"Vitest subprocess exceeded timeout; increase LIVE_TEST_ATTEMPT_TIMEOUT_MS or debug stuck teardown/hooks.",
	[LIVE_TEST_ERROR_CODES.AUTH_PERMISSION]:
		"Verify GEMINI_API_KEY validity, permissions, and project scope; rotate key if needed.",
	[LIVE_TEST_ERROR_CODES.ASSERTION_RUNTIME]:
		"Fix test/runtime assertion failure before retrying; this failure is non-transient.",
	[LIVE_TEST_ERROR_CODES.MAX_ATTEMPTS_REACHED]:
		"Max retry attempts reached; inspect failure evidence and fix root cause before rerun.",
	[LIVE_TEST_ERROR_CODES.UNKNOWN]:
		"Inspect live-test logs and failure evidence, then rerun after resolving unknown failure.",
});

const OUTPUT_REDACTION_RULES = Object.freeze([
	{
		pattern: /(GEMINI_API_KEY\s*=\s*)[^\s'"]+/gi,
		replacement: "$1<redacted>",
	},
	{
		pattern: /(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/-]+/gi,
		replacement: "$1<redacted>",
	},
	{
		pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
		replacement: "<redacted_ai_key>",
	},
]);

function emitLiveTestLog(
	level,
	event,
	meta = {},
	traceId = "live_test_missing_trace",
) {
	process.stderr.write(
		`${JSON.stringify({
			ts: new Date().toISOString(),
			level,
			event,
			traceId,
			...meta,
		})}\n`,
	);
}

function getRecommendedAction(errorCode) {
	return (
		LIVE_TEST_RECOMMENDED_ACTIONS[errorCode] ??
		LIVE_TEST_RECOMMENDED_ACTIONS[LIVE_TEST_ERROR_CODES.UNKNOWN]
	);
}

function createLiveTestError(message, errorCode, recommendedAction, cause) {
	const error = new Error(message, cause ? { cause } : undefined);
	error.errorCode = errorCode;
	error.recommendedAction = recommendedAction;
	return error;
}

function classifyScriptFailure({ error, message }) {
	if (error && typeof error === "object") {
		const errorCode = error.errorCode;
		if (typeof errorCode === "string") {
			return {
				errorCode,
				recommendedAction:
					typeof error.recommendedAction === "string"
						? error.recommendedAction
						: getRecommendedAction(errorCode),
			};
		}
	}
	if (/required for live tests but was not found/i.test(message)) {
		return {
			errorCode: LIVE_TEST_ERROR_CODES.KEY_MISSING,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.KEY_MISSING,
			),
		};
	}
	if (/placeholder or test token/i.test(message)) {
		return {
			errorCode: LIVE_TEST_ERROR_CODES.KEY_PLACEHOLDER,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.KEY_PLACEHOLDER,
			),
		};
	}
	if (AUTH_ERROR_PATTERN.test(message)) {
		return {
			errorCode: LIVE_TEST_ERROR_CODES.AUTH_PERMISSION,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.AUTH_PERMISSION,
			),
		};
	}
	if (NON_TRANSIENT_ERROR_PATTERN.test(message)) {
		return {
			errorCode: LIVE_TEST_ERROR_CODES.ASSERTION_RUNTIME,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.ASSERTION_RUNTIME,
			),
		};
	}
	if (SUBPROCESS_TIMEOUT_PATTERN.test(message)) {
		return {
			errorCode: LIVE_TEST_ERROR_CODES.SUBPROCESS_TIMEOUT,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.SUBPROCESS_TIMEOUT,
			),
		};
	}
	if (TRANSIENT_ERROR_PATTERN.test(message)) {
		return {
			errorCode: LIVE_TEST_ERROR_CODES.NETWORK_TRANSIENT,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.NETWORK_TRANSIENT,
			),
		};
	}
	return {
		errorCode: LIVE_TEST_ERROR_CODES.UNKNOWN,
		recommendedAction: getRecommendedAction(LIVE_TEST_ERROR_CODES.UNKNOWN),
	};
}

function redactSensitiveOutput(rawText) {
	let text = String(rawText ?? "");
	for (const rule of OUTPUT_REDACTION_RULES) {
		text = text.replace(rule.pattern, rule.replacement);
	}
	return text;
}

function clampOutput(text, maxBytes) {
	const raw = String(text ?? "");
	const limit =
		Number.isInteger(maxBytes) && maxBytes > 0
			? maxBytes
			: DEFAULT_LIVE_TEST_MAX_OUTPUT_BYTES;
	const rawBytes = Buffer.byteLength(raw, "utf8");
	if (rawBytes <= limit) {
		return raw;
	}
	const truncated = Buffer.from(raw, "utf8")
		.subarray(rawBytes - limit)
		.toString("utf8");
	return `[truncated to last ${limit} bytes]\n${truncated}`;
}

function looksLikePlaceholderGeminiKey(key) {
	const normalized = String(key ?? "").trim();
	if (!normalized) {
		return true;
	}
	const collapsed = normalized.replace(/[\s"']/g, "");
	if (collapsed.length < 16) {
		return true;
	}
	if (PLACEHOLDER_KEY_PATTERN.test(collapsed)) {
		return true;
	}
	if (
		/(?:^|[_-])(test|demo|sample|fake|mock|placeholder|dummy)(?:[_-]|$)/i.test(
			collapsed,
		) ||
		collapsed.includes("YOUR_GEMINI_API_KEY")
	) {
		return true;
	}
	return false;
}

function classifyRetryReason({ output, exitCode }) {
	const combined = String(output ?? "");
	if (SUBPROCESS_TIMEOUT_PATTERN.test(combined) || exitCode === 124) {
		return {
			type: "timeout",
			retryable: false,
			reason: "vitest subprocess exceeded attempt timeout",
			errorCode: LIVE_TEST_ERROR_CODES.SUBPROCESS_TIMEOUT,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.SUBPROCESS_TIMEOUT,
			),
		};
	}
	if (AUTH_ERROR_PATTERN.test(combined)) {
		return {
			type: "auth",
			retryable: false,
			reason: "authentication/authorization failure",
			errorCode: LIVE_TEST_ERROR_CODES.AUTH_PERMISSION,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.AUTH_PERMISSION,
			),
		};
	}
	if (NON_TRANSIENT_ERROR_PATTERN.test(combined)) {
		return {
			type: "code",
			retryable: false,
			reason: "non-transient assertion/runtime failure",
			errorCode: LIVE_TEST_ERROR_CODES.ASSERTION_RUNTIME,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.ASSERTION_RUNTIME,
			),
		};
	}
	if (TRANSIENT_ERROR_PATTERN.test(combined)) {
		return {
			type: "network",
			retryable: true,
			reason: "transient network/upstream failure signature detected",
			errorCode: LIVE_TEST_ERROR_CODES.NETWORK_TRANSIENT,
			recommendedAction: getRecommendedAction(
				LIVE_TEST_ERROR_CODES.NETWORK_TRANSIENT,
			),
		};
	}
	if (exitCode === 130 || exitCode === 143) {
		return {
			type: "interrupted",
			retryable: false,
			reason: "interrupted by signal",
			errorCode: LIVE_TEST_ERROR_CODES.UNKNOWN,
			recommendedAction: getRecommendedAction(LIVE_TEST_ERROR_CODES.UNKNOWN),
		};
	}
	return {
		type: "unknown",
		retryable: false,
		reason: "non-transient or unknown failure signature",
		errorCode: LIVE_TEST_ERROR_CODES.UNKNOWN,
		recommendedAction: getRecommendedAction(LIVE_TEST_ERROR_CODES.UNKNOWN),
	};
}

function redactEvidenceSnippet(rawText) {
	return redactSensitiveOutput(rawText).slice(0, 240);
}

function findEvidenceSnippet(output) {
	const lines = String(output ?? "")
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.slice(-50);
	for (const line of lines) {
		if (
			AUTH_ERROR_PATTERN.test(line) ||
			NON_TRANSIENT_ERROR_PATTERN.test(line) ||
			TRANSIENT_ERROR_PATTERN.test(line)
		) {
			return redactEvidenceSnippet(line);
		}
	}
	return redactEvidenceSnippet(lines.at(-1) ?? "");
}

function sleepSync(ms) {
	const waitMs = Math.max(0, Math.floor(ms));
	if (waitMs === 0) {
		return;
	}
	const array = new Int32Array(new SharedArrayBuffer(4));
	Atomics.wait(array, 0, 0, waitMs);
}

function sleepWithHeartbeatSync(
	ms,
	{ tickMs = 5_000, onTick = () => {} } = {},
) {
	const totalMs = Math.max(0, Math.floor(ms));
	if (totalMs === 0) {
		return;
	}
	const safeTickMs = Math.max(1, Math.floor(tickMs));
	let remainingMs = totalMs;
	while (remainingMs > 0) {
		const sliceMs = Math.min(remainingMs, safeTickMs);
		sleepSync(sliceMs);
		remainingMs -= sliceMs;
		if (remainingMs > 0) {
			onTick({
				totalMs,
				elapsedMs: totalMs - remainingMs,
				remainingMs,
			});
		}
	}
}

function buildRetryDelayMs(baseDelayMs, attempt, maxDelayMs) {
	const safeBase =
		Number.isInteger(baseDelayMs) && baseDelayMs >= 0
			? baseDelayMs
			: DEFAULT_LIVE_TEST_RETRY_BASE_DELAY_MS;
	const safeMax =
		Number.isInteger(maxDelayMs) && maxDelayMs > 0
			? maxDelayMs
			: DEFAULT_LIVE_TEST_RETRY_MAX_DELAY_MS;
	if (safeBase === 0) {
		return 0;
	}
	const exponential = Math.min(
		safeMax,
		safeBase * 2 ** Math.max(0, attempt - 1),
	);
	const jitter = Math.floor(
		Math.random() * Math.max(250, Math.floor(exponential * 0.15)),
	);
	return Math.min(safeMax, exponential + jitter);
}

function isProcessExited(childProcess) {
	return (
		!childProcess ||
		childProcess.exitCode !== null ||
		childProcess.signalCode !== null
	);
}

function hasRealProcessId(childProcess) {
	return Number.isInteger(childProcess?.pid) && childProcess.pid > 0;
}

function isProcessAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ESRCH"
		) {
			return false;
		}
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "EPERM"
		) {
			return true;
		}
		return false;
	}
}

function terminateHeartbeat(
	heartbeatProcess,
	{ traceId = "live_test_missing_trace" } = {},
) {
	if (
		!heartbeatProcess ||
		heartbeatProcess.exitCode !== null ||
		heartbeatProcess.signalCode !== null
	) {
		return;
	}
	if (!hasRealProcessId(heartbeatProcess)) {
		return;
	}
	const heartbeatPid = heartbeatProcess.pid;
	try {
		heartbeatProcess.kill("SIGTERM");
	} catch (error) {
		if (
			!error ||
			typeof error !== "object" ||
			!("code" in error) ||
			error.code !== "ESRCH"
		) {
			throw error;
		}
		return;
	}
	const deadlineAt = Date.now() + DEFAULT_HEARTBEAT_EXIT_TIMEOUT_MS;
	while (Date.now() < deadlineAt) {
		if (!isProcessAlive(heartbeatPid) || isProcessExited(heartbeatProcess)) {
			return;
		}
		sleepSync(25);
	}
	if (!isProcessAlive(heartbeatPid) || isProcessExited(heartbeatProcess)) {
		return;
	}
	emitLiveTestLog(
		"warn",
		"live_test_heartbeat_termination_timeout",
		{
			stage: "heartbeat_termination",
			timeoutMs: DEFAULT_HEARTBEAT_EXIT_TIMEOUT_MS,
			pid: heartbeatPid,
			action: "sigterm_timeout_escalating_sigkill",
			escalationSignal: "SIGKILL",
		},
		traceId,
	);
	try {
		heartbeatProcess.kill("SIGKILL");
	} catch (error) {
		if (
			!error ||
			typeof error !== "object" ||
			!("code" in error) ||
			error.code !== "ESRCH"
		) {
			throw error;
		}
		return;
	}

	let terminatedAfterSigkill = false;
	const sigkillConfirmationDeadline =
		Date.now() + DEFAULT_HEARTBEAT_SIGKILL_CONFIRM_WINDOW_MS;
	while (Date.now() < sigkillConfirmationDeadline) {
		if (!isProcessAlive(heartbeatPid) || isProcessExited(heartbeatProcess)) {
			terminatedAfterSigkill = true;
			break;
		}
		sleepSync(DEFAULT_HEARTBEAT_SIGKILL_CONFIRM_POLL_MS);
	}
	if (!terminatedAfterSigkill) {
		sleepSync(DEFAULT_HEARTBEAT_SIGKILL_CONFIRM_POLL_MS);
		if (!isProcessAlive(heartbeatPid) || isProcessExited(heartbeatProcess)) {
			terminatedAfterSigkill = true;
		}
	}
	if (terminatedAfterSigkill) {
		emitLiveTestLog(
			"info",
			"live_test_heartbeat_termination_escalated",
			{
				stage: "heartbeat_termination",
				pid: heartbeatPid,
				action: "sigkill_sent",
				result: "terminated",
			},
			traceId,
		);
		return;
	}
	emitLiveTestLog(
		"error",
		"live_test_heartbeat_termination_escalated",
		{
			stage: "heartbeat_termination",
			pid: heartbeatPid,
			action: "sigkill_sent",
			result: "still_alive",
		},
		traceId,
	);
}

export {
	AUTH_ERROR_PATTERN,
	DEFAULT_HEARTBEAT_EXIT_TIMEOUT_MS,
	DEFAULT_HEARTBEAT_SIGKILL_CONFIRM_POLL_MS,
	DEFAULT_HEARTBEAT_SIGKILL_CONFIRM_WINDOW_MS,
	DEFAULT_LIVE_TEST_ATTEMPT_TIMEOUT_MS,
	DEFAULT_LIVE_TEST_MAX_OUTPUT_BYTES,
	DEFAULT_LIVE_TEST_RETRY_BASE_DELAY_MS,
	DEFAULT_LIVE_TEST_RETRY_MAX_DELAY_MS,
	LIVE_TEST_ERROR_CODES,
	classifyRetryReason,
	buildRetryDelayMs,
	classifyScriptFailure,
	clampOutput,
	createLiveTestError,
	emitLiveTestLog,
	findEvidenceSnippet,
	getRecommendedAction,
	looksLikePlaceholderGeminiKey,
	redactSensitiveOutput,
	sleepWithHeartbeatSync,
	terminateHeartbeat,
};
