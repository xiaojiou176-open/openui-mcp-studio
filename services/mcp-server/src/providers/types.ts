import type { GeminiThinkingLevel, OpenuiModelRouteKey } from "../constants.js";

export type MediaResolution = "low" | "medium" | "high" | "ultra_high";

export type FunctionResponseInput = {
	name: string;
	response: Record<string, unknown>;
	thought_signature?: string;
	call_id?: string;
	[key: string]: unknown;
};

export type AiPolicyConfig = {
	uiWorkflow?: boolean;
	structuredOutputRequired?: boolean;
	autoIncludeThoughts?: boolean;
	autoContextCaching?: boolean;
	autoMediaResolution?: boolean;
	longContextThresholdChars?: number;
	defaultCacheTtlSeconds?: number;
};

export type InputPart =
	| {
			type: "text";
			text: string;
	  }
	| {
			type: "image" | "video" | "audio" | "pdf";
			mimeType: string;
			data: string;
			mediaResolution?: MediaResolution;
	  };

export type AiCompleteInput = {
	prompt: string;
	system?: string;
	model?: string;
	routeKey?: OpenuiModelRouteKey;
	useFast?: boolean;
	temperature?: number;
	requestId?: string;
	inputParts?: InputPart[];
	thinkingLevel?: GeminiThinkingLevel;
	includeThoughts?: boolean;
	responseMimeType?: string;
	responseJsonSchema?: Record<string, unknown>;
	tools?: Array<Record<string, unknown>>;
	toolChoice?: string | Record<string, unknown>;
	functionResponses?: Array<FunctionResponseInput | Record<string, unknown>>;
	cachedContent?: string;
	cacheTtlSeconds?: number;
	mediaResolution?: MediaResolution;
	policyConfig?: AiPolicyConfig;
};

export type AiProvider = "gemini";

export type AiProviderModelResolution = {
	routeKey: OpenuiModelRouteKey | null;
	resolvedModel: string;
	source: "explicit" | "route" | "default" | "primary";
	routingMode: "on" | "off";
};

export type AiProviderListResult = {
	provider: AiProvider;
	models: string[];
	notes?: string[];
};
