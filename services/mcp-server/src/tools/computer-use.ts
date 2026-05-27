import crypto from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	getGeminiDefaultTemperature,
	getGeminiModelStrong,
} from "../constants.js";
import { logError, logInfo, logWarn } from "../logger.js";
import { computerUseStepWithGemini } from "../providers/gemini-provider.js";
import { textResult } from "./shared.js";

const RiskLevelSchema = z.enum(["low", "medium", "high"]);

// Server-side confirmation token store
const pendingConfirmationTokens = new Map<
	string,
	{ scope: string; sessionId: string; expiresAt: number }
>();

function normalizeSessionId(sessionId: string | undefined): string {
	const normalized = sessionId?.trim();
	return normalized && normalized.length > 0 ? normalized : "anonymous";
}

function pruneExpiredConfirmationTokens(now = Date.now()): void {
	for (const [token, record] of pendingConfirmationTokens.entries()) {
		if (record.expiresAt < now) {
			pendingConfirmationTokens.delete(token);
		}
	}
}

function issueConfirmationToken(scope: string, sessionId: string): string {
	const now = Date.now();
	pruneExpiredConfirmationTokens(now);
	const token = crypto.randomBytes(16).toString("hex");
	pendingConfirmationTokens.set(token, {
		scope,
		sessionId,
		expiresAt: now + 5 * 60_000, // 5 min TTL
	});
	return token;
}

function validateConfirmationToken(
	token: string,
	scope: string,
	sessionId: string,
): boolean {
	const now = Date.now();
	pruneExpiredConfirmationTokens(now);
	const record = pendingConfirmationTokens.get(token);
	if (
		!record ||
		record.scope !== scope ||
		record.sessionId !== sessionId ||
		record.expiresAt < now
	) {
		return false;
	}
	pendingConfirmationTokens.delete(token); // single-use
	return true;
}

export const MultimodalImageSchema = z.object({
	mimeType: z.string().min(1),
	data: z.string().min(1),
	mediaResolution: z.enum(["low", "medium", "high", "ultra_high"]).optional(),
});

export const MultimodalInputSchema = z.object({
	text: z.string().min(1),
	images: z.array(MultimodalImageSchema).default([]),
});

export const ComputerUseActionSchema = z.object({
	type: z.enum([
		"observe",
		"click",
		"type_text",
		"keypress",
		"scroll",
		"wait",
		"navigate",
		"navigate_external",
		"execute_shell",
		"file_write",
		"file_delete",
		"submit",
		"payment",
		"account_change",
	]),
	target: z.string().optional(),
	value: z.string().optional(),
	risk: RiskLevelSchema.optional(),
});

const ObserveInputSchema = z.object({
	input: MultimodalInputSchema,
	model: z.string().optional(),
	invokeModel: z.boolean().default(true),
});

const ExecuteActionInputSchema = z.object({
	action: ComputerUseActionSchema,
	sessionId: z.string().optional(),
	requireConfirmation: z.boolean().default(true),
	confirmed: z.boolean().default(false),
	confirmationToken: z.string().optional(),
});

const LoopInputSchema = z.object({
	sessionId: z.string().optional(),
	input: MultimodalInputSchema,
	plannedActions: z.array(ComputerUseActionSchema).default([]),
	maxSteps: z.number().int().min(1).max(20).default(5),
	requireConfirmation: z.boolean().default(true),
	confirmed: z.boolean().default(false),
	confirmationToken: z.string().optional(),
	invokeModel: z.boolean().default(true),
	model: z.string().optional(),
});

export const ComputerUseInputSchema = LoopInputSchema;

const BUILT_IN_RISKY_ACTIONS = new Set([
	"navigate_external",
	"execute_shell",
	"file_write",
	"file_delete",
	"submit",
	"payment",
	"account_change",
]);

function isRiskyComputerUseAction(
	action: z.infer<typeof ComputerUseActionSchema>,
): boolean {
	return action.risk === "high" || BUILT_IN_RISKY_ACTIONS.has(action.type);
}

function serializeAction(
	action: z.infer<typeof ComputerUseActionSchema>,
): string {
	return [
		action.type,
		action.target ?? "",
		action.value ?? "",
		action.risk ?? "",
	].join("|");
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
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

function toGeminiContents(
	input: z.infer<typeof MultimodalInputSchema>,
): unknown[] {
	const parts: unknown[] = [];

	for (const image of input.images) {
		const part: Record<string, unknown> = {
			inline_data: {
				mime_type: image.mimeType,
				data: image.data,
			},
		};
		if (image.mediaResolution) {
			part.media_resolution = image.mediaResolution.toUpperCase();
		}
		parts.push(part);
	}

	parts.push({ text: input.text });

	return [{ role: "user", parts }];
}

async function observeWithGemini(input: {
	multimodal: z.infer<typeof MultimodalInputSchema>;
	model?: string;
	traceId?: string;
}): Promise<{
	text: string;
	functionCalls: Array<Record<string, unknown>>;
	safetyDecisions: Array<Record<string, unknown>>;
}> {
	const resolvedModel = input.model?.trim() || getGeminiModelStrong().model;
	const traceId = input.traceId || "computer_use_observe";
	let response: Awaited<ReturnType<typeof computerUseStepWithGemini>>;
	try {
		response = await computerUseStepWithGemini({
			model: resolvedModel,
			contents: toGeminiContents(input.multimodal),
			temperature: getGeminiDefaultTemperature(),
		});
	} catch (error) {
		logError("computer_use_observe_failed", {
			traceId,
			stage: "observe",
			context: {
				model: resolvedModel,
				imageCount: input.multimodal.images.length,
			},
			error: toErrorMessage(error),
		});
		throw error;
	}

	return {
		text: typeof response.text === "string" ? response.text : "",
		functionCalls: toRecordArray(response.function_calls),
		safetyDecisions: toRecordArray(response.safety_decisions),
	};
}

export function registerComputerUseTool(server: McpServer): void {
	server.registerTool(
		"openui_observe_screen",
		{
			description:
				"Analyze current screen inputs and return Gemini observation without executing actions.",
			inputSchema: ObserveInputSchema,
		},
		async (args) => {
			const input = ObserveInputSchema.parse(args);

			if (!input.invokeModel) {
				return textResult(
					JSON.stringify(
						{
							status: "ok",
							mode: "dry-run",
							observation: "Model invocation skipped by invokeModel=false.",
							imageCount: input.input.images.length,
						},
						null,
						2,
					),
				);
			}

			const observation = await observeWithGemini({
				multimodal: input.input,
				model: input.model,
			});

			return textResult(
				JSON.stringify(
					{
						status: "ok",
						mode: "gemini",
						observation: observation.text,
						functionCalls: observation.functionCalls,
						safetyDecisions: observation.safetyDecisions,
						imageCount: input.input.images.length,
					},
					null,
					2,
				),
			);
		},
	);

	server.registerTool(
		"openui_execute_ui_action",
		{
			description:
				"Validate and acknowledge a single UI action with safety confirmation. This tool does not drive a browser by itself.",
			inputSchema: ExecuteActionInputSchema,
		},
		async (args) => {
			const input = ExecuteActionInputSchema.parse(args);
			const normalizedSessionId = normalizeSessionId(input.sessionId);
			const traceId =
				input.sessionId?.trim() ||
				`computer_use_action_${Date.now().toString(36)}`;
			const risky = isRiskyComputerUseAction(input.action);
			const confirmationRequired = risky && input.requireConfirmation;
			const scope = `single:${serializeAction(input.action)}`;
			const confirmedWithToken =
				confirmationRequired &&
				input.confirmed &&
				input.confirmationToken &&
				validateConfirmationToken(
					input.confirmationToken,
					scope,
					normalizedSessionId,
				);

			if (confirmationRequired && !confirmedWithToken) {
				const expectedToken = issueConfirmationToken(
					scope,
					normalizedSessionId,
				);
				logWarn("computer_use_action_confirmation_blocked", {
					traceId,
					stage: "authorization",
					context: {
						actionType: input.action.type,
						sessionId: normalizedSessionId,
					},
					error: "confirmation_required",
				});
				return textResult(
					JSON.stringify(
						{
							status: "blocked_confirmation",
							requireConfirmation: true,
							confirmed: false,
							requiredConfirmationToken: expectedToken,
							blockedAction: input.action,
						},
						null,
						2,
					),
				);
			}

			logInfo("computer_use_action_executed", {
				traceId,
				stage: "action_execute",
				context: {
					actionType: input.action.type,
					requireConfirmation: input.requireConfirmation,
					confirmationValidated: confirmedWithToken,
				},
			});
			return textResult(
				JSON.stringify(
					{
						status: "ok",
						executed: {
							...input.action,
							executedAt: new Date().toISOString(),
						},
						confirmationValidated: confirmedWithToken,
					},
					null,
					2,
				),
			);
		},
	);

	server.registerTool(
		"openui_computer_use_loop",
		{
			description:
				"Run an observe-plan-act loop with safety confirmation guard and structured execution records. This tool is not a standalone browser driver.",
			inputSchema: LoopInputSchema,
		},
		async (args) => {
			const input = LoopInputSchema.parse(args);
			const normalizedSessionId = normalizeSessionId(input.sessionId);
			const traceId =
				input.sessionId?.trim() ||
				`computer_use_loop_${Date.now().toString(36)}`;
			const planned = input.plannedActions.slice(0, input.maxSteps);
			const truncated = input.plannedActions.length > planned.length;
			const riskyActions = planned
				.map((action, index) => ({ action, index }))
				.filter(({ action }) => isRiskyComputerUseAction(action));
			const confirmationRequired =
				riskyActions.length > 0 && input.requireConfirmation;
			const scope = `loop:${riskyActions
				.map(({ action, index }) => `${index}:${serializeAction(action)}`)
				.join("||")}`;
			const confirmedWithToken =
				!confirmationRequired ||
				(input.confirmed &&
					input.confirmationToken &&
					validateConfirmationToken(
						input.confirmationToken,
						scope,
						normalizedSessionId,
					));

			if (confirmationRequired && !confirmedWithToken) {
				const expectedToken = issueConfirmationToken(
					scope,
					normalizedSessionId,
				);
				logWarn("computer_use_loop_confirmation_blocked", {
					traceId,
					stage: "authorization",
					context: {
						riskyActionCount: riskyActions.length,
						sessionId: normalizedSessionId,
					},
					error: "confirmation_required",
				});
				return textResult(
					JSON.stringify(
						{
							status: "blocked_confirmation",
							sessionId: input.sessionId ?? null,
							blockedActions: riskyActions.map(({ action, index }) => ({
								index,
								type: action.type,
								target: action.target ?? null,
							})),
							requiredConfirmationToken: expectedToken,
							truncated,
							executedSteps: [],
						},
						null,
						2,
					),
				);
			}

			let observation: {
				text: string;
				functionCalls: Array<Record<string, unknown>>;
				safetyDecisions: Array<Record<string, unknown>>;
			} | null = null;
			if (input.invokeModel) {
				observation = await observeWithGemini({
					multimodal: input.input,
					model: input.model,
					traceId,
				});
			}

			const executedSteps = planned.map((action, index) => ({
				step: index + 1,
				type: action.type,
				action,
				status: "executed",
			}));

			return textResult(
				JSON.stringify(
					{
						status: "ok",
						sessionId: input.sessionId ?? null,
						requireConfirmation: input.requireConfirmation,
						confirmed: input.confirmed,
						imageCount: input.input.images.length,
						executedCount: executedSteps.length,
						truncated,
						executedSteps,
						observation,
					},
					null,
					2,
				),
			);
		},
	);
}
