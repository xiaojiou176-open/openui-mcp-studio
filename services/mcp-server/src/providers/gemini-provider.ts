import {
	getGeminiApiKey,
	getGeminiDefaultTemperature,
	getGeminiDefaultThinkingLevel,
	getGeminiSidecarPath,
	getGeminiSidecarPythonBin,
	getOpenuiTimeoutMs,
	type OpenuiModelResolution,
} from "../constants.js";
import { logDebug, logError } from "../logger.js";
import {
	GeminiPythonSidecarBridge,
	type SidecarEmbedResult,
	type SidecarGenerateResult,
	type SidecarListModelsResult,
} from "./gemini-python-sidecar.js";
import type {
	AiCompleteInput,
	AiProviderListResult,
	FunctionResponseInput,
	InputPart,
	MediaResolution,
} from "./types.js";

let cachedBridge: GeminiPythonSidecarBridge | null = null;

const DEFAULT_LONG_CONTEXT_THRESHOLD_CHARS = 4_000;
const DEFAULT_AUTO_CACHE_TTL_SECONDS = 300;
const DEFAULT_SIDECAR_STARTUP_TIMEOUT_MS = 30_000;
const UI_PROMPT_KEYWORDS =
	/\b(ui|ux|wireframe|mockup|screenshot|screen|layout|component|multimodal|image|video|audio|pdf)\b/i;

function getBridge(): GeminiPythonSidecarBridge {
	if (!cachedBridge) {
		cachedBridge = new GeminiPythonSidecarBridge({
			pythonBin: getGeminiSidecarPythonBin(),
			scriptPath: getGeminiSidecarPath(),
			requestTimeoutMs: getOpenuiTimeoutMs(),
			startupTimeoutMs: Math.min(
				getOpenuiTimeoutMs(),
				DEFAULT_SIDECAR_STARTUP_TIMEOUT_MS,
			),
			env: {
				GEMINI_API_KEY: getGeminiApiKey(),
			},
		});
	}
	return cachedBridge;
}

function mapInputPartToGeminiPart(part: InputPart): unknown {
	if (part.type === "text") {
		return {
			text: part.text,
		};
	}

	const payload: Record<string, unknown> = {
		inline_data: {
			mime_type: part.mimeType,
			data: part.data,
		},
	};

	return payload;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter(isObjectRecord);
}

function stringifyForSignature(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function normalizeFunctionResponses(
	functionResponses:
		| Array<FunctionResponseInput | Record<string, unknown>>
		| undefined,
): FunctionResponseInput[] | undefined {
	if (functionResponses === undefined) {
		return undefined;
	}

	if (!Array.isArray(functionResponses)) {
		throw new Error("functionResponses must be an array when provided.");
	}

	return functionResponses.map((item, index) => {
		if (!isObjectRecord(item)) {
			throw new Error(`functionResponses[${index}] must be an object.`);
		}

		if (typeof item.name !== "string" || !item.name.trim()) {
			throw new Error(
				`functionResponses[${index}].name must be a non-empty string.`,
			);
		}

		if (!isObjectRecord(item.response)) {
			throw new Error(
				`functionResponses[${index}].response must be an object.`,
			);
		}

		let thoughtSignature = item.thought_signature;
		if (thoughtSignature === undefined) {
			const raw = `${item.name}:${stringifyForSignature(item.response)}:${index}`;
			thoughtSignature = `legacy_${Buffer.from(raw).toString("base64url").slice(0, 24)}`;
		}

		if (typeof thoughtSignature !== "string" || !thoughtSignature.trim()) {
			throw new Error(
				`functionResponses[${index}].thought_signature must be a non-empty string.`,
			);
		}

		return {
			...item,
			name: item.name.trim(),
			response: item.response,
			thought_signature: thoughtSignature.trim(),
		};
	});
}

function countInputChars(input: AiCompleteInput): number {
	const promptChars = input.prompt.length;
	const partChars = (input.inputParts || []).reduce((acc, part) => {
		if (part.type === "text") {
			return acc + part.text.length;
		}
		return acc + part.data.length;
	}, 0);
	return promptChars + partChars;
}

function hasNonTextInputPart(input: AiCompleteInput): boolean {
	return (input.inputParts || []).some((part) => part.type !== "text");
}

function shouldPreferHighMediaResolution(input: AiCompleteInput): boolean {
	return (
		input.policyConfig?.uiWorkflow === true ||
		hasNonTextInputPart(input) ||
		UI_PROMPT_KEYWORDS.test(input.prompt)
	);
}

function normalizeInputPartMediaResolution(
	part: InputPart,
	defaultResolution: MediaResolution | undefined,
): InputPart {
	if (part.type === "text" || !defaultResolution || part.mediaResolution) {
		return part;
	}

	return {
		...part,
		mediaResolution: defaultResolution,
	};
}

function applyGeminiRequestPolicy(
	input: AiCompleteInput,
	resolution: OpenuiModelResolution,
): AiCompleteInput {
	const policy = input.policyConfig || {};
	const autoIncludeThoughts = policy.autoIncludeThoughts ?? true;
	const autoContextCaching = policy.autoContextCaching ?? true;
	const autoMediaResolution = policy.autoMediaResolution ?? true;
	const longContextThresholdChars =
		policy.longContextThresholdChars ?? DEFAULT_LONG_CONTEXT_THRESHOLD_CHARS;
	const defaultCacheTtlSeconds =
		policy.defaultCacheTtlSeconds ?? DEFAULT_AUTO_CACHE_TTL_SECONDS;

	const complexTask =
		resolution.routeKey === "strong" ||
		Boolean(input.tools?.length) ||
		Boolean(input.functionResponses?.length) ||
		Boolean(input.responseJsonSchema) ||
		Boolean(input.policyConfig?.structuredOutputRequired) ||
		hasNonTextInputPart(input);

	const normalizedFunctionResponses = normalizeFunctionResponses(
		input.functionResponses,
	);
	const normalized: AiCompleteInput = {
		...input,
		functionResponses: normalizedFunctionResponses,
	};

	if (
		autoIncludeThoughts &&
		normalized.includeThoughts === undefined &&
		complexTask
	) {
		normalized.includeThoughts = true;
	}

	const longContext = countInputChars(normalized) >= longContextThresholdChars;
	const cacheCompatible =
		!normalized.system &&
		!normalized.tools?.length &&
		normalized.toolChoice === undefined;

	if (
		autoContextCaching &&
		cacheCompatible &&
		longContext &&
		!normalized.cachedContent
	) {
		const route = resolution.routeKey || "default";
		normalized.cachedContent = `auto/${route}/${Date.now().toString(36)}`;
	}
	if (
		autoContextCaching &&
		normalized.cachedContent &&
		normalized.cacheTtlSeconds === undefined
	) {
		normalized.cacheTtlSeconds = defaultCacheTtlSeconds;
	}

	if (
		autoMediaResolution &&
		!normalized.mediaResolution &&
		shouldPreferHighMediaResolution(normalized)
	) {
		normalized.mediaResolution = "high";
	}

	if (autoMediaResolution && normalized.inputParts?.length) {
		normalized.inputParts = normalized.inputParts.map((part) =>
			normalizeInputPartMediaResolution(part, normalized.mediaResolution),
		);
	}

	return normalized;
}

function buildGeminiContents(input: AiCompleteInput): unknown {
	const parts: unknown[] = [];

	for (const part of input.inputParts || []) {
		parts.push(mapInputPartToGeminiPart(part));
	}

	if (input.prompt.trim()) {
		parts.push({ text: input.prompt.trim() });
	}

	if (parts.length === 0) {
		return input.prompt;
	}

	return [{ role: "user", parts }];
}

function normalizeJsonSchema(
	value: unknown,
): Record<string, unknown> | undefined {
	if (!isObjectRecord(value)) {
		return undefined;
	}
	return value;
}

function normalizeMediaResolution(
	value: string | undefined,
): string | undefined {
	if (!value || !value.trim()) {
		return undefined;
	}
	return value.toUpperCase();
}

export type GeminiCompletionResult = {
	text: string;
	function_calls: Array<Record<string, unknown>>;
	safety_decisions: Array<Record<string, unknown>>;
};

type GeminiProviderErrorCode = "GEMINI_EMBED_INVALID_RESPONSE";

function createGeminiProviderError(
	errorCode: GeminiProviderErrorCode,
	message: string,
): Error & { errorCode: GeminiProviderErrorCode } {
	return Object.assign(new Error(message), {
		name: "GeminiProviderError",
		errorCode,
	});
}

function createGeminiEmbedInvalidResponseError(
	detail: string,
): Error & { errorCode: GeminiProviderErrorCode } {
	return createGeminiProviderError(
		"GEMINI_EMBED_INVALID_RESPONSE",
		`Gemini embed_content returned invalid embeddings payload: ${detail}`,
	);
}

function validateGeminiEmbeddingsPayload(embeddings: unknown): number[][] {
	if (!Array.isArray(embeddings)) {
		throw createGeminiEmbedInvalidResponseError(
			"expected embeddings to be an array.",
		);
	}

	const normalizedEmbeddings: number[][] = [];
	let expectedDimensions: number | undefined;

	for (
		let embeddingIndex = 0;
		embeddingIndex < embeddings.length;
		embeddingIndex += 1
	) {
		const embedding = embeddings[embeddingIndex];
		if (!Array.isArray(embedding)) {
			throw createGeminiEmbedInvalidResponseError(
				`expected embeddings[${embeddingIndex}] to be an array of finite numbers.`,
			);
		}

		const normalizedVector: number[] = [];
		for (let valueIndex = 0; valueIndex < embedding.length; valueIndex += 1) {
			const value = embedding[valueIndex];
			if (typeof value !== "number" || !Number.isFinite(value)) {
				throw createGeminiEmbedInvalidResponseError(
					`expected embeddings[${embeddingIndex}][${valueIndex}] to be a finite number.`,
				);
			}
			normalizedVector.push(value);
		}

		if (expectedDimensions === undefined) {
			expectedDimensions = normalizedVector.length;
		} else if (normalizedVector.length !== expectedDimensions) {
			throw createGeminiEmbedInvalidResponseError(
				`expected consistent embedding dimensions, got ${expectedDimensions} and ${normalizedVector.length}.`,
			);
		}

		normalizedEmbeddings.push(normalizedVector);
	}

	return normalizedEmbeddings;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export async function completeWithGeminiResult(
	input: AiCompleteInput,
	resolution: OpenuiModelResolution,
): Promise<GeminiCompletionResult> {
	const bridge = getBridge();
	const normalizedInput = applyGeminiRequestPolicy(input, resolution);
	const traceId = normalizedInput.requestId || "gemini_generate_content";
	let response: SidecarGenerateResult;
	try {
		response = await bridge.request<SidecarGenerateResult>(
			"generate_content",
			{
				model: resolution.resolvedModel,
				contents: buildGeminiContents(normalizedInput),
				request_id: normalizedInput.requestId,
				system_instruction: normalizedInput.system,
				temperature:
					normalizedInput.temperature ?? getGeminiDefaultTemperature(),
				thinking_level:
					normalizedInput.thinkingLevel ?? getGeminiDefaultThinkingLevel(),
				include_thoughts: normalizedInput.includeThoughts,
				response_mime_type: normalizedInput.responseMimeType,
				response_json_schema: normalizeJsonSchema(
					normalizedInput.responseJsonSchema,
				),
				tools: normalizedInput.tools,
				tool_choice: normalizedInput.toolChoice,
				function_responses: normalizedInput.functionResponses,
				cached_content: normalizedInput.cachedContent,
				cache_ttl_seconds: normalizedInput.cacheTtlSeconds,
				media_resolution: normalizeMediaResolution(
					normalizedInput.mediaResolution,
				),
			},
			undefined,
			{ requestId: normalizedInput.requestId },
		);
	} catch (error) {
		logError("gemini_generate_content_failed", {
			requestId: normalizedInput.requestId,
			traceId,
			stage: "provider_request",
			provider: "gemini",
			context: {
				model: resolution.resolvedModel,
			},
			error: toErrorMessage(error),
		});
		throw error;
	}

	const text = typeof response?.text === "string" ? response.text.trim() : "";
	const function_calls = toRecordArray(response?.function_calls);
	const safety_decisions = toRecordArray(response?.safety_decisions);

	return {
		text,
		function_calls,
		safety_decisions,
	};
}

export async function completeWithGemini(
	input: AiCompleteInput,
	resolution: OpenuiModelResolution,
): Promise<string> {
	const response = await completeWithGeminiResult(input, resolution);
	if (!response.text && response.function_calls.length === 0) {
		throw new Error("Gemini returned empty text content.");
	}

	return response.text;
}

export async function listGeminiModels(
	limit = 120,
): Promise<AiProviderListResult> {
	const bridge = getBridge();
	const normalizedLimit = Math.max(1, Math.min(limit, 200));
	const traceId = `gemini_list_models_${Date.now().toString(36)}`;
	let response: SidecarListModelsResult;
	try {
		response = await bridge.request<SidecarListModelsResult>("list_models", {
			limit: normalizedLimit,
		});
	} catch (error) {
		logError("gemini_list_models_failed", {
			traceId,
			stage: "provider_request",
			provider: "gemini",
			context: {
				limit: normalizedLimit,
			},
			error: toErrorMessage(error),
		});
		throw error;
	}

	const ids = Array.isArray(response?.models)
		? response.models.filter(
				(item): item is string =>
					typeof item === "string" && item.trim().length > 0,
			)
		: [];
	logDebug("gemini_list_models_success", {
		traceId,
		stage: "provider_response",
		provider: "gemini",
		context: {
			limit: normalizedLimit,
			modelCount: ids.length,
		},
	});

	return {
		provider: "gemini",
		models: Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b)),
		notes: ["Model list is served by Gemini python sidecar."],
	};
}

export async function embedWithGemini(input: {
	contents: unknown;
	outputDimensionality?: number;
	model: string;
}): Promise<number[][]> {
	const bridge = getBridge();
	const traceId = `gemini_embed_${Date.now().toString(36)}`;
	let response: SidecarEmbedResult;
	try {
		response = await bridge.request<SidecarEmbedResult>("embed_content", {
			model: input.model,
			contents: input.contents,
			output_dimensionality: input.outputDimensionality,
		});
	} catch (error) {
		logError("gemini_embed_failed", {
			traceId,
			stage: "provider_request",
			provider: "gemini",
			context: {
				model: input.model,
				outputDimensionality: input.outputDimensionality ?? null,
			},
			error: toErrorMessage(error),
		});
		throw error;
	}

	let embeddings: number[][];
	try {
		embeddings = validateGeminiEmbeddingsPayload(response?.embeddings);
	} catch (error) {
		const normalizedError =
			error instanceof Error &&
			"errorCode" in error &&
			error.errorCode === "GEMINI_EMBED_INVALID_RESPONSE"
				? (error as Error & { errorCode: GeminiProviderErrorCode })
				: createGeminiEmbedInvalidResponseError(toErrorMessage(error));
		logError("gemini_embed_invalid_response", {
			traceId,
			stage: "provider_response",
			provider: "gemini",
			context: {
				model: input.model,
			},
			errorCode: normalizedError.errorCode,
			error: normalizedError.message,
		});
		throw normalizedError;
	}

	return embeddings;
}

export async function computerUseStepWithGemini(input: {
	model: string;
	contents: unknown;
	systemInstruction?: string;
	temperature?: number;
	excludedPredefinedFunctions?: string[];
}): Promise<SidecarGenerateResult> {
	const bridge = getBridge();
	const traceId = `gemini_computer_use_${Date.now().toString(36)}`;
	try {
		return await bridge.request<SidecarGenerateResult>("computer_use_step", {
			model: input.model,
			contents: input.contents,
			system_instruction: input.systemInstruction,
			temperature: input.temperature ?? getGeminiDefaultTemperature(),
			excluded_predefined_functions: input.excludedPredefinedFunctions,
		});
	} catch (error) {
		logError("gemini_computer_use_step_failed", {
			traceId,
			stage: "provider_request",
			provider: "gemini",
			context: {
				model: input.model,
			},
			error: toErrorMessage(error),
		});
		throw error;
	}
}

export async function resetGeminiProviderForTests(): Promise<void> {
	if (!cachedBridge) {
		return;
	}
	await cachedBridge.stop();
	cachedBridge = null;
}
