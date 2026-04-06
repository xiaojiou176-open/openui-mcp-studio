import { z } from "zod";
import {
	buildDefaultShadcnStyleGuide,
	type OpenuiModelRouteKey,
} from "../constants.js";
import { extractJsonObject, tryParseJson } from "../json-utils.js";
import { openuiChatComplete, openuiListModels } from "../openui-client.js";
import { detectShadcnPaths } from "../path-detection.js";
import type {
	AiPolicyConfig,
	FunctionResponseInput,
	InputPart,
	MediaResolution,
} from "../providers/types.js";
import {
	isProtectedWorkspacePath,
	normalizePath,
} from "../../../../packages/shared-runtime/src/path-utils.js";
import type { GeneratedFile, MultiFileOutput } from "../types.js";

export const GeneratedFileSchema = z.object({
	path: z.string().min(1),
	content: z.string(),
});

export const FunctionResponseSchema = z
	.object({
		name: z.string().trim().min(1),
		response: z.record(z.string(), z.unknown()),
		thought_signature: z.string().trim().min(1).optional(),
		call_id: z.string().trim().min(1).optional(),
	})
	.passthrough();

export const FunctionResponsesSchema = z.array(FunctionResponseSchema);

const MultiFileOutputSchema = z.object({
	files: z.array(GeneratedFileSchema).min(1),
	notes: z.array(z.string()).optional(),
});

export const MultiFileOutputJsonSchema: Record<string, unknown> = {
	type: "object",
	additionalProperties: false,
	properties: {
		files: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", minLength: 1 },
					content: { type: "string" },
				},
				required: ["path", "content"],
			},
		},
		notes: {
			type: "array",
			items: { type: "string" },
		},
	},
	required: ["files"],
};

export type ShadcnDetection = Awaited<ReturnType<typeof detectShadcnPaths>>;

export function sanitizeGeneratedFiles(
	files: GeneratedFile[],
): GeneratedFile[] {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	const normalizedFiles: GeneratedFile[] = [];

	for (const file of files) {
		const normalizedPath = normalizePath(file.path);
		if (
			!normalizedPath ||
			normalizedPath.startsWith("/") ||
			normalizedPath
				.split("/")
				.some((segment) => segment === ".." || segment === "")
		) {
			throw new Error(`Invalid generated file path: ${file.path}`);
		}
		if (isProtectedWorkspacePath(normalizedPath)) {
			throw new Error(
				`Generated file path targets protected file: ${file.path}`,
			);
		}
		if (seen.has(normalizedPath)) {
			duplicates.add(normalizedPath);
			continue;
		}
		seen.add(normalizedPath);
		normalizedFiles.push({
			path: normalizedPath,
			content: file.content,
		});
	}

	if (duplicates.size > 0) {
		throw new Error(
			`Duplicate generated file paths are not allowed: ${Array.from(duplicates).join(", ")}`,
		);
	}

	return normalizedFiles;
}

export function textResult(text: string) {
	return {
		content: [{ type: "text" as const, text }],
	};
}

export function newRequestId(prefix: string): string {
	const ts = Date.now().toString(36);
	const rnd = Math.random().toString(36).slice(2, 8);
	return `${prefix}_${ts}_${rnd}`;
}

const HTML_ONLY_SYSTEM_PROMPT =
	"Generate HTML only (no markdown), semantic and accessible.";

function buildPromptWithStyleConstraints(
	prompt: string,
	styleGuide: string,
): string {
	return `${prompt}\n\nStyle constraints:\n${styleGuide}`;
}

export type PromptToHtmlInput = {
	prompt: string;
	styleGuide: string;
	model?: string;
	requestIdPrefix: string;
	routeKey?: OpenuiModelRouteKey;
	temperature?: number;
	useFast?: boolean;
	inputParts?: InputPart[];
	thinkingLevel?: "low" | "high";
	includeThoughts?: boolean;
	responseMimeType?: string;
	responseJsonSchema?: Record<string, unknown>;
	tools?: Array<Record<string, unknown>>;
	toolChoice?: string | Record<string, unknown>;
	functionResponses?: FunctionResponseInput[];
	cachedContent?: string;
	cacheTtlSeconds?: number;
	mediaResolution?: MediaResolution;
	policyConfig?: AiPolicyConfig;
};

export async function requestHtmlFromPrompt(
	input: PromptToHtmlInput,
): Promise<string> {
	const request = {
		system: HTML_ONLY_SYSTEM_PROMPT,
		prompt: buildPromptWithStyleConstraints(input.prompt, input.styleGuide),
		model: input.model,
		routeKey: input.routeKey,
		requestId: newRequestId(input.requestIdPrefix),
		inputParts: input.inputParts,
		thinkingLevel: input.thinkingLevel,
		includeThoughts: input.includeThoughts ?? false,
		responseMimeType: input.responseMimeType,
		responseJsonSchema: input.responseJsonSchema,
		tools: input.tools,
		toolChoice: input.toolChoice,
		functionResponses: input.functionResponses,
		cachedContent: input.cachedContent,
		cacheTtlSeconds: input.cacheTtlSeconds,
		mediaResolution: input.mediaResolution,
		policyConfig: {
			uiWorkflow: true,
			...input.policyConfig,
		},
		...(typeof input.temperature === "number"
			? { temperature: input.temperature }
			: {}),
		...(input.routeKey === undefined && input.useFast !== undefined
			? { useFast: input.useFast }
			: {}),
	};

	return openuiChatComplete(request);
}

export async function listOpenuiModels(): Promise<unknown> {
	return openuiListModels();
}

export type ConvertHtmlToReactShadcnInput = {
	html: string;
	pagePath: string;
	componentsDir: string;
	uiImportBase?: string;
	styleGuide?: string;
	model?: string;
	workspaceRoot?: string;
	detection?: ShadcnDetection;
	thinkingLevel?: "low" | "high";
	includeThoughts?: boolean;
	responseMimeType?: string;
	responseJsonSchema?: Record<string, unknown>;
	tools?: Array<Record<string, unknown>>;
	toolChoice?: string | Record<string, unknown>;
	functionResponses?: FunctionResponseInput[];
	cachedContent?: string;
	cacheTtlSeconds?: number;
	mediaResolution?: MediaResolution;
	policyConfig?: AiPolicyConfig;
};

export type ConvertHtmlToReactShadcnResult = {
	detection: ShadcnDetection;
	payload: MultiFileOutput;
};

export async function resolveShadcnStyleGuide(args: {
	workspaceRoot?: string;
	uiImportBase?: string;
	styleGuide?: string;
	detection?: ShadcnDetection;
}): Promise<{
	detection: ShadcnDetection;
	uiImportBase: string;
	styleGuide: string;
}> {
	const detection =
		args.detection ?? (await detectShadcnPaths(args.workspaceRoot));
	const uiImportBase = args.uiImportBase?.trim() || detection.uiImportBase;
	const styleGuide =
		args.styleGuide?.trim() || buildDefaultShadcnStyleGuide(uiImportBase);

	return {
		detection,
		uiImportBase,
		styleGuide,
	};
}

export async function convertHtmlToReactShadcn(
	args: ConvertHtmlToReactShadcnInput,
): Promise<ConvertHtmlToReactShadcnResult> {
	const { detection, uiImportBase, styleGuide } = await resolveShadcnStyleGuide(
		{
			workspaceRoot: args.workspaceRoot,
			uiImportBase: args.uiImportBase,
			styleGuide: args.styleGuide,
			detection: args.detection,
		},
	);

	const system = `You are a senior frontend engineer.
Return ONLY valid JSON. No markdown fences, no explanation.
Schema:
{
  "files": [{"path": string, "content": string}],
  "notes": string[] (optional)
}
All files must be TypeScript React with Tailwind utility classes only.`;

	const prompt = `Convert HTML to React + Tailwind (shadcn style) with file splitting.

Constraints:
${styleGuide}

Project requirements:
- Next.js App Router page path: ${args.pagePath}
- Extract reusable components under: ${args.componentsDir}
- Import shadcn primitives from: ${uiImportBase}/...
- Keep primitive imports stable; do not generate shadcn primitive source files.
- No package.json/lockfile/install instructions.

HTML:
${args.html}`;

	const raw = await openuiChatComplete({
		prompt,
		system,
		model: args.model,
		routeKey: "strong",
		temperature: 0.2,
		requestId: newRequestId("convert"),
		thinkingLevel: args.thinkingLevel,
		includeThoughts: args.includeThoughts,
		responseMimeType: "application/json",
		responseJsonSchema: MultiFileOutputJsonSchema,
		tools: args.tools,
		toolChoice: args.toolChoice,
		functionResponses: args.functionResponses,
		cachedContent: args.cachedContent,
		cacheTtlSeconds: args.cacheTtlSeconds,
		mediaResolution: args.mediaResolution,
		policyConfig: {
			uiWorkflow: true,
			structuredOutputRequired: true,
			...args.policyConfig,
		},
	});

	const candidateJson = extractJsonObject(raw) || raw;
	const parsed = tryParseJson<MultiFileOutput>(candidateJson);
	if (!parsed) {
		throw new Error(`Model output is not valid JSON. Raw:\n${raw}`);
	}

	const validation = MultiFileOutputSchema.safeParse(parsed);
	if (!validation.success) {
		throw new Error(
			`Model JSON does not match files schema: ${validation.error.message}`,
		);
	}

	const files = sanitizeGeneratedFiles(validation.data.files);
	for (const file of files) {
		const primitiveDir = normalizePath(detection.uiDir);
		if (normalizePath(file.path).startsWith(`${primitiveDir}/`)) {
			throw new Error(
				`Model attempted to generate shadcn primitive file: ${file.path}`,
			);
		}
	}

	return {
		detection,
		payload: {
			files,
			notes: validation.data.notes,
		},
	};
}
