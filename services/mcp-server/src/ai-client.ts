import {
	getOpenuiMaxRetries,
	getOpenuiRetryBaseMs,
	type OpenuiModelResolution,
	resolveOpenuiModel,
} from "./constants.js";
import { logDebug, logError, logInfo, logWarn } from "./logger.js";
import {
	completeWithGemini,
	listGeminiModels,
} from "./providers/gemini-provider.js";
import type {
	AiCompleteInput,
	AiProviderListResult,
} from "./providers/types.js";

function toAbortError(message = "The operation was aborted."): Error {
	const error = new Error(message);
	error.name = "AbortError";
	return error;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (!signal) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	if (signal.aborted) {
		return Promise.reject(toAbortError());
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timeout);
			signal.removeEventListener("abort", onAbort);
			reject(toAbortError());
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

function backoffDelay(attempt: number): number {
	const base = getOpenuiRetryBaseMs();
	const jitter = Math.floor(Math.random() * 100);
	return base * 2 ** attempt + jitter;
}

function makeRequestId(prefix: string): string {
	const ts = Date.now().toString(36);
	const rnd = Math.random().toString(36).slice(2, 8);
	return `${prefix}_${ts}_${rnd}`;
}

function extractStatus(error: unknown): number | undefined {
	if (!error || typeof error !== "object") {
		return undefined;
	}

	const record = error as Record<string, unknown>;

	const directStatus = Number(record.status);
	if (Number.isFinite(directStatus)) {
		return directStatus;
	}

	const directStatusCode = Number(record.statusCode);
	if (Number.isFinite(directStatusCode)) {
		return directStatusCode;
	}

	const details = record.details;
	if (!details || typeof details !== "object") {
		return undefined;
	}

	const sidecarStatus = Number(
		(details as { rpcError?: { data?: { status?: unknown } } }).rpcError?.data
			?.status,
	);
	if (Number.isFinite(sidecarStatus)) {
		return sidecarStatus;
	}

	const detailsStatus = Number((details as { status?: unknown }).status);
	return Number.isFinite(detailsStatus) ? detailsStatus : undefined;
}

function extractMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function extractSidecarRemoteData(
	error: unknown,
): Record<string, unknown> | undefined {
	if (!error || typeof error !== "object") {
		return undefined;
	}
	const record = error as Record<string, unknown>;
	const details =
		record.details && typeof record.details === "object"
			? (record.details as Record<string, unknown>)
			: undefined;
	const rpcError =
		details?.rpcError && typeof details.rpcError === "object"
			? (details.rpcError as Record<string, unknown>)
			: undefined;
	const data =
		rpcError?.data && typeof rpcError.data === "object"
			? (rpcError.data as Record<string, unknown>)
			: undefined;
	return data;
}

function errorTypeOf(error: unknown): string {
	if (!error || typeof error !== "object") {
		return "UnknownError";
	}
	const record = error as Record<string, unknown>;
	const explicitCode = record.code;
	if (typeof explicitCode === "string" && explicitCode.trim()) {
		return explicitCode;
	}
	if (error instanceof Error && error.name.trim()) {
		return error.name;
	}
	return "UnknownError";
}

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	const normalized = new Error(extractMessage(error));
	(normalized as Error & { cause?: unknown }).cause = error;
	return normalized;
}

function toAiRequestError(input: {
	error: unknown;
	requestId: string;
	attempt: number;
	maxRetries: number;
}): Error {
	const base = toError(input.error);
	const status = extractStatus(input.error);
	const statusSuffix = typeof status === "number" ? `, status=${status}` : "";
	const wrapped = new Error(
		`Gemini request failed (requestId=${input.requestId}, attempt=${input.attempt + 1}/${input.maxRetries + 1}${statusSuffix}): ${base.message}`,
	);
	(wrapped as Error & { cause?: unknown }).cause = base;
	return wrapped;
}

function isNetworkLikeError(error: unknown): boolean {
	const message = extractMessage(error);
	const sidecarData = extractSidecarRemoteData(error);
	const sidecarKind =
		typeof sidecarData?.kind === "string" ? sidecarData.kind.trim() : "";
	const sidecarType =
		typeof sidecarData?.error_type === "string"
			? sidecarData.error_type.trim().toLowerCase()
			: "";
	const sidecarDetail =
		typeof sidecarData?.message === "string"
			? sidecarData.message.trim().toLowerCase()
			: "";
	if (sidecarKind === "upstream_error") {
		const looksAuthLike =
			/auth|permission|api key|unauthorized|forbidden|invalid/i.test(
				`${sidecarType} ${sidecarDetail}`,
			);
		if (!looksAuthLike) {
			return true;
		}
	}
	return /abort|timeout|network|fetch|socket|econn|enotfound|reset/i.test(
		message,
	);
}

function isRetriableStatus(status: number | undefined): boolean {
	return (
		status === 408 ||
		status === 429 ||
		(typeof status === "number" && status >= 500)
	);
}

function canRetry(error: unknown): boolean {
	if (error instanceof Error && error.name === "AbortError") {
		return false;
	}
	const status = extractStatus(error);
	return isRetriableStatus(status) || isNetworkLikeError(error);
}

function extractAbortSignal(input: AiCompleteInput): AbortSignal | undefined {
	const candidate =
		(input as unknown as Record<string, unknown>).signal ??
		(input as unknown as Record<string, unknown>).abortSignal;
	if (!candidate || typeof candidate !== "object") {
		return undefined;
	}

	if (
		"aborted" in candidate &&
		typeof (candidate as { aborted?: unknown }).aborted === "boolean"
	) {
		return candidate as AbortSignal;
	}
	return undefined;
}

export async function aiChatComplete(input: AiCompleteInput): Promise<string> {
	const requestId = input.requestId || makeRequestId("ai");
	const maxRetries = getOpenuiMaxRetries();
	const signal = extractAbortSignal(input);
	if (signal?.aborted) {
		throw toAbortError();
	}
	if (input.routeKey !== undefined && input.useFast === true) {
		throw new Error(
			"routeKey and useFast cannot be used together in one request.",
		);
	}
	const resolution = resolveOpenuiModel({
		explicitModel: input.model,
		routeKey: input.routeKey,
		useFast: input.useFast,
	});

	logInfo("ai_model_resolved", {
		requestId,
		traceId: requestId,
		stage: "model_resolution",
		provider: "gemini",
		routeKey: resolution.routeKey,
		resolvedModel: resolution.resolvedModel,
		source: resolution.source,
		routingMode: resolution.routingMode,
	});

	for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
		const attemptStartedAtMs = Date.now();
		if (signal?.aborted) {
			throw toAbortError();
		}
		try {
			const text = await completeWithGemini(
				{ ...input, requestId },
				resolution,
			);
			logDebug("ai_request_success", {
				requestId,
				traceId: requestId,
				stage: "completion",
				provider: "gemini",
				attempt,
				durationMs: Date.now() - attemptStartedAtMs,
			});
			return text;
		} catch (error) {
			if (canRetry(error) && attempt < maxRetries) {
				const waitMs = backoffDelay(attempt);
				logWarn("ai_request_retry", {
					requestId,
					traceId: requestId,
					stage: "completion",
					errorType: errorTypeOf(error),
					provider: "gemini",
					attempt,
					maxRetries,
					status: extractStatus(error),
					durationMs: Date.now() - attemptStartedAtMs,
					waitMs,
					context: {
						routeKey: resolution.routeKey,
						resolvedModel: resolution.resolvedModel,
					},
					error: extractMessage(error),
				});
				await sleep(waitMs, signal);
				continue;
			}

			const normalizedError = toAiRequestError({
				error,
				requestId,
				attempt,
				maxRetries,
			});
			logError("ai_request_failed", {
				requestId,
				traceId: requestId,
				stage: "completion",
				errorType: errorTypeOf(error),
				provider: "gemini",
				attempt,
				maxRetries,
				status: extractStatus(error),
				durationMs: Date.now() - attemptStartedAtMs,
				context: {
					routeKey: resolution.routeKey,
					resolvedModel: resolution.resolvedModel,
				},
				error: normalizedError.message,
			});
			throw normalizedError;
		}
	}

	throw new Error(
		`Gemini request failed unexpectedly after retry loop (requestId=${requestId}, maxRetries=${maxRetries}).`,
	);
}

export type AiModelListPayload = {
	primary: AiProviderListResult;
	notes: string[];
};

export async function aiListModels(limit = 120): Promise<AiModelListPayload> {
	const requestId = makeRequestId("models");
	const startedAtMs = Date.now();
	try {
		const primary = await listGeminiModels(limit);
		logDebug("ai_list_models_success", {
			requestId,
			traceId: requestId,
			stage: "model_list",
			provider: "gemini",
			context: {
				limit,
			},
			durationMs: Date.now() - startedAtMs,
		});
		return {
			primary,
			notes: ["Gemini is the only runtime provider."],
		};
	} catch (error) {
		const message = extractMessage(error);
		logError("ai_list_models_failed", {
			requestId,
			traceId: requestId,
			stage: "model_list",
			provider: "gemini",
			errorType: errorTypeOf(error),
			context: {
				limit,
			},
			durationMs: Date.now() - startedAtMs,
			error: message,
		});
		throw toError(error);
	}
}

export { extractStatus };

export function resetAiClientForTests(): void {
	// Provider-level caches are reset by test-only exports on each provider.
}

export type { AiCompleteInput, OpenuiModelResolution };
