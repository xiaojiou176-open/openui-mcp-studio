import crypto from "node:crypto";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	DEFAULT_COMPONENTS_DIR,
	DEFAULT_PAGE_PATH,
	getWorkspaceRoot,
} from "../constants.js";
import {
	applyGeneratedFiles,
	type RollbackDetail,
	readWorkspaceFileIfExistsNoFollow,
	removeWorkspaceFileIfExistsNoFollow,
	writeWorkspaceFileNoFollow,
} from "../file-ops.js";
import type { FunctionResponseInput } from "../providers/types.js";
import { runQualityGate } from "../quality-gate.js";
import { shipIdempotencyStore } from "../../../../packages/shared-runtime/src/idempotency-store.js";
import { shipJobQueue } from "../../../../packages/shared-runtime/src/job-queue.js";
import {
	convertHtmlToReactShadcn,
	FunctionResponsesSchema,
	requestHtmlFromPrompt,
	resolveShadcnStyleGuide,
	textResult,
} from "./shared.js";

type TelemetryStepStatus = "ok" | "error";

type TelemetryStep = {
	name: string;
	status: TelemetryStepStatus;
	durationMs: number;
	error?: string;
};

type ShipSummaryStatus = "success" | "quality_failed";

type ShipSummary = {
	filesCount: number;
	changedPaths: string[];
	qualityGate: boolean;
	status: ShipSummaryStatus;
	idempotencyHit: boolean;
};

function deriveImplicitIdempotencyKey(input: {
	prompt: string;
	styleGuide?: string;
	requestedUiImportBase?: string;
	resolvedUiImportBase?: string;
	pagePath: string;
	componentsDir: string;
	workspaceRoot: string;
	model?: string;
	thinkingLevel?: "low" | "high";
	includeThoughts?: boolean;
	responseMimeType?: string;
	responseJsonSchema?: Record<string, unknown>;
	tools?: Array<Record<string, unknown>>;
	toolChoice?: string | Record<string, unknown>;
	functionResponses?: FunctionResponseInput[];
	cachedContent?: string;
	cacheTtlSeconds?: number;
	mediaResolution?: "low" | "medium" | "high" | "ultra_high";
	uiuxScore?: number;
	uiuxThreshold?: number;
	dryRun: boolean;
	runCommands: boolean;
}): string {
	const payload = JSON.stringify({
		prompt: input.prompt,
		styleGuide: input.styleGuide || "",
		requestedUiImportBase: input.requestedUiImportBase ?? null,
		resolvedUiImportBase: input.resolvedUiImportBase ?? null,
		pagePath: input.pagePath,
		componentsDir: input.componentsDir,
		workspaceRoot: path.resolve(input.workspaceRoot),
		model: input.model || "",
		thinkingLevel: input.thinkingLevel ?? null,
		includeThoughts: input.includeThoughts ?? null,
		responseMimeType: input.responseMimeType ?? null,
		responseJsonSchema: input.responseJsonSchema ?? null,
		tools: input.tools ?? null,
		toolChoice: input.toolChoice ?? null,
		functionResponses: input.functionResponses ?? null,
		cachedContent: input.cachedContent ?? null,
		cacheTtlSeconds: input.cacheTtlSeconds ?? null,
		mediaResolution: input.mediaResolution ?? null,
		uiuxScore: input.uiuxScore ?? null,
		uiuxThreshold: input.uiuxThreshold ?? null,
		dryRun: input.dryRun,
		runCommands: input.runCommands,
	});
	return crypto.createHash("sha256").update(payload).digest("hex");
}

type ShipPayloadBase = {
	workspaceRoot: string;
	detection: unknown;
	html: string;
	files: Array<{ path: string; content: string }>;
	notes: string[] | undefined;
	apply: Awaited<ReturnType<typeof applyGeneratedFiles>> & {
		rollbackReason?: "quality_gate_failed";
	};
	quality: {
		passed: boolean;
	};
};

type FileBackup = {
	path: string;
	existed: boolean;
	previousContent?: string;
};

async function snapshotFiles(
	targetRoot: string,
	paths: string[],
): Promise<Map<string, FileBackup>> {
	const snapshots = new Map<string, FileBackup>();
	for (const filePath of paths) {
		const previousContent = await readWorkspaceFileIfExistsNoFollow({
			targetRoot,
			filePath,
		});
		if (typeof previousContent === "string") {
			snapshots.set(filePath, {
				path: filePath,
				existed: true,
				previousContent,
			});
		} else {
			snapshots.set(filePath, {
				path: filePath,
				existed: false,
			});
		}
	}
	return snapshots;
}

async function rollbackWrittenFiles(
	targetRoot: string,
	writtenPaths: string[],
	snapshots: Map<string, FileBackup>,
	writtenContentByPath: Map<string, string>,
): Promise<{ rolledBack: boolean; rollbackDetails: RollbackDetail[] }> {
	const rollbackDetails: RollbackDetail[] = [];
	for (const filePath of [...writtenPaths].reverse()) {
		const snapshot = snapshots.get(filePath);
		if (!snapshot) {
			rollbackDetails.push({
				path: filePath,
				status: "remove_failed",
				message: "Missing pre-apply backup snapshot.",
			});
			continue;
		}

		try {
			const expectedContent = writtenContentByPath.get(snapshot.path);
			const currentContent = await readWorkspaceFileIfExistsNoFollow({
				targetRoot,
				filePath: snapshot.path,
			});

			if (
				typeof expectedContent === "string" &&
				currentContent !== null &&
				currentContent !== expectedContent
			) {
				rollbackDetails.push({
					path: snapshot.path,
					status: snapshot.existed
						? "restore_skipped_conflict"
						: "remove_skipped_conflict",
					message: "Skipped rollback because file content changed after apply.",
				});
				continue;
			}

			if (snapshot.existed) {
				await writeWorkspaceFileNoFollow({
					targetRoot,
					filePath: snapshot.path,
					content: snapshot.previousContent || "",
				});
				rollbackDetails.push({ path: snapshot.path, status: "restored" });
			} else {
				if (currentContent !== null) {
					await removeWorkspaceFileIfExistsNoFollow({
						targetRoot,
						filePath: snapshot.path,
					});
				}
				rollbackDetails.push({ path: snapshot.path, status: "removed" });
			}
		} catch (error) {
			rollbackDetails.push({
				path: snapshot.path,
				status: snapshot.existed ? "restore_failed" : "remove_failed",
				message: toErrorMessage(error),
			});
		}
	}

	return {
		rolledBack:
			rollbackDetails.length === writtenPaths.length &&
			rollbackDetails.every(
				(detail) => detail.status === "restored" || detail.status === "removed",
			),
		rollbackDetails,
	};
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

async function runRequiredStep<T>(
	steps: TelemetryStep[],
	name: string,
	fn: () => Promise<T>,
): Promise<T> {
	const start = Date.now();
	try {
		const result = await fn();
		steps.push({
			name,
			status: "ok",
			durationMs: Date.now() - start,
		});
		return result;
	} catch (error) {
		steps.push({
			name,
			status: "error",
			durationMs: Date.now() - start,
			error: toErrorMessage(error),
		});
		throw error;
	}
}

async function runBestEffortStep<T>(
	steps: TelemetryStep[],
	name: string,
	fn: () => Promise<T>,
): Promise<T | undefined> {
	const start = Date.now();
	try {
		const result = await fn();
		steps.push({
			name,
			status: "ok",
			durationMs: Date.now() - start,
		});
		return result;
	} catch (error) {
		steps.push({
			name,
			status: "error",
			durationMs: Date.now() - start,
			error: toErrorMessage(error),
		});
		return undefined;
	}
}

function buildSummary(
	payload: ShipPayloadBase,
	idempotencyHit: boolean,
): ShipSummary {
	if (payload.apply.rolledBack) {
		return {
			filesCount: payload.files.length,
			changedPaths: [],
			qualityGate: payload.quality.passed,
			status: payload.quality.passed ? "success" : "quality_failed",
			idempotencyHit,
		};
	}

	const changedPaths =
		payload.apply.written && payload.apply.written.length > 0
			? payload.apply.written
			: payload.files.map((file) => file.path);

	return {
		filesCount: payload.files.length,
		changedPaths,
		qualityGate: payload.quality.passed,
		status: payload.quality.passed ? "success" : "quality_failed",
		idempotencyHit,
	};
}

function isReusableCachedPayload(
	payload: ShipPayloadBase | undefined,
): payload is ShipPayloadBase {
	return payload !== undefined && payload.quality.passed === true;
}

type SingleFlightResult<T> = {
	value: T;
	shared: boolean;
};

type PipelineResult = {
	payload: ShipPayloadBase;
	idempotencyHit: boolean;
};

const PIPELINE_SAFETY_TIMEOUT_MS = 300_000;
const IDEMPOTENCY_WAIT_TIMEOUT_MS = PIPELINE_SAFETY_TIMEOUT_MS;

const inflightByIdempotencyKey = new Map<string, Promise<PipelineResult>>();

async function awaitPipelineSafetyTimeout<T>(task: Promise<T>): Promise<T> {
	let safetyTimeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			task,
			new Promise<never>((_, reject) => {
				safetyTimeoutId = setTimeout(
					() => reject(new Error("Ship pipeline safety timeout")),
					PIPELINE_SAFETY_TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		if (safetyTimeoutId !== undefined) {
			clearTimeout(safetyTimeoutId);
		}
	}
}

async function runSingleFlightByKey(
	key: string,
	execute: () => Promise<PipelineResult>,
): Promise<SingleFlightResult<PipelineResult>> {
	const existing = inflightByIdempotencyKey.get(key);
	if (existing) {
		return {
			value: await awaitPipelineSafetyTimeout(existing),
			shared: true,
		};
	}

	const task = execute();
	inflightByIdempotencyKey.set(key, task);
	const onSettled = (): void => {
		const current = inflightByIdempotencyKey.get(key);
		if (current === task) {
			inflightByIdempotencyKey.delete(key);
		}
	};
	void task.then(onSettled, onSettled);

	return {
		value: await awaitPipelineSafetyTimeout(task),
		shared: false,
	};
}

export function registerShipTool(server: McpServer): void {
	server.registerTool(
		"openui_ship_react_page",
		{
			description:
				"End-to-end ship tool: prompt -> generate -> convert -> apply -> quality gate.",
			inputSchema: z.object({
				prompt: z.string().min(1),
				pagePath: z.string().default(DEFAULT_PAGE_PATH),
				componentsDir: z.string().default(DEFAULT_COMPONENTS_DIR),
				uiImportBase: z.string().optional(),
				styleGuide: z.string().optional(),
				model: z.string().optional(),
				workspaceRoot: z.string().optional(),
				idempotencyKey: z.string().optional(),
				thinkingLevel: z.enum(["low", "high"]).optional(),
				includeThoughts: z.boolean().optional(),
				responseMimeType: z.string().optional(),
				responseJsonSchema: z.record(z.string(), z.unknown()).optional(),
				tools: z.array(z.record(z.string(), z.unknown())).optional(),
				toolChoice: z
					.union([z.string(), z.record(z.string(), z.unknown())])
					.optional(),
				functionResponses: FunctionResponsesSchema.optional(),
				cachedContent: z.string().optional(),
				cacheTtlSeconds: z.number().int().positive().optional(),
				mediaResolution: z
					.enum(["low", "medium", "high", "ultra_high"])
					.optional(),
				uiuxScore: z.number().min(0).max(100).optional(),
				uiuxThreshold: z.number().min(0).max(100).optional(),
				dryRun: z.boolean().default(false),
				runCommands: z.boolean().default(false),
			}),
		},
		async ({
			prompt,
			pagePath,
			componentsDir,
			uiImportBase,
			styleGuide,
			model,
			workspaceRoot,
			idempotencyKey,
			thinkingLevel,
			includeThoughts,
			responseMimeType,
			responseJsonSchema,
			tools,
			toolChoice,
			functionResponses,
			cachedContent,
			cacheTtlSeconds,
			mediaResolution,
			uiuxScore,
			uiuxThreshold,
			dryRun,
			runCommands,
		}) =>
			shipJobQueue.enqueue(async () => {
				const steps: TelemetryStep[] = [];
				const root = workspaceRoot || getWorkspaceRoot();
				const explicitIdempotencyKey = idempotencyKey?.trim() || undefined;

				if (explicitIdempotencyKey) {
					const cachedPayload = await runBestEffortStep(
						steps,
						"idempotency_lookup",
						() =>
							shipIdempotencyStore.get<ShipPayloadBase>(explicitIdempotencyKey),
					);

					if (isReusableCachedPayload(cachedPayload)) {
						return textResult(
							JSON.stringify(
								{
									...cachedPayload,
									steps,
									summary: buildSummary(cachedPayload, true),
								},
								null,
								2,
							),
						);
					}
				}

				const resolved = await runRequiredStep(
					steps,
					"resolve_style_guide",
					() =>
						resolveShadcnStyleGuide({
							workspaceRoot: root,
							uiImportBase,
							styleGuide,
						}),
				);

				const effectiveIdempotencyKey =
					explicitIdempotencyKey ||
					deriveImplicitIdempotencyKey({
						prompt,
						styleGuide: resolved.styleGuide,
						requestedUiImportBase: uiImportBase,
						resolvedUiImportBase: resolved.uiImportBase,
						pagePath,
						componentsDir,
						workspaceRoot: root,
						model,
						thinkingLevel,
						includeThoughts,
						responseMimeType,
						responseJsonSchema,
						tools,
						toolChoice,
						functionResponses,
						cachedContent,
						cacheTtlSeconds,
						mediaResolution,
						uiuxScore,
						uiuxThreshold,
						dryRun,
						runCommands,
					});

				if (!explicitIdempotencyKey && effectiveIdempotencyKey) {
					const cachedPayload = await runBestEffortStep(
						steps,
						"idempotency_lookup",
						() =>
							shipIdempotencyStore.get<ShipPayloadBase>(
								effectiveIdempotencyKey,
							),
					);

					if (isReusableCachedPayload(cachedPayload)) {
						return textResult(
							JSON.stringify(
								{
									...cachedPayload,
									steps,
									summary: buildSummary(cachedPayload, true),
								},
								null,
								2,
							),
						);
					}
				}

				const runPipeline = async (): Promise<{
					payload: ShipPayloadBase;
					idempotencyHit: boolean;
				}> => {
					const execution = await runRequiredStep(
						steps,
						"idempotency_begin_execution",
						() =>
							shipIdempotencyStore.beginExecution<ShipPayloadBase>(
								effectiveIdempotencyKey,
							),
					);

					if (
						execution.status === "cached" &&
						isReusableCachedPayload(execution.value)
					) {
						return { payload: execution.value, idempotencyHit: true };
					}

					if (execution.status === "inflight") {
						const waitResult = await runRequiredStep(
							steps,
							"idempotency_wait",
							() =>
								shipIdempotencyStore.waitFor<ShipPayloadBase>(
									effectiveIdempotencyKey,
									{
										timeoutMs: IDEMPOTENCY_WAIT_TIMEOUT_MS,
									},
								),
						);

						if (
							waitResult.status === "ready" &&
							isReusableCachedPayload(waitResult.value)
						) {
							return { payload: waitResult.value, idempotencyHit: true };
						}

						if (waitResult.status === "timeout_inflight") {
							throw new Error(
								`Idempotency wait timed out for key ${effectiveIdempotencyKey} (status=timeout_inflight).`,
							);
						}

						throw new Error(
							`Idempotency wait ended without cached result for key ${effectiveIdempotencyKey} (status=timeout_missing).`,
						);
					}

					if (execution.status !== "acquired") {
						throw new Error("Idempotency execution did not acquire lease.");
					}

					const stopHeartbeat = execution.lease.startHeartbeat();
					try {
						const makePageText = await runRequiredStep(
							steps,
							"generate_html",
							() =>
								requestHtmlFromPrompt({
									prompt,
									styleGuide: resolved.styleGuide,
									model,
									routeKey: "strong",
									thinkingLevel,
									includeThoughts,
									responseMimeType,
									responseJsonSchema,
									tools,
									toolChoice,
									functionResponses,
									cachedContent,
									cacheTtlSeconds,
									mediaResolution,
									requestIdPrefix: "ship_html",
								}),
						);

						const converted = await runRequiredStep(
							steps,
							"convert_react",
							() =>
								convertHtmlToReactShadcn({
									html: makePageText,
									pagePath,
									componentsDir,
									uiImportBase: resolved.uiImportBase,
									styleGuide: resolved.styleGuide,
									model,
									workspaceRoot: root,
									detection: resolved.detection,
									thinkingLevel,
									includeThoughts,
									responseMimeType,
									responseJsonSchema,
									tools,
									toolChoice,
									functionResponses,
									cachedContent,
									cacheTtlSeconds,
									mediaResolution,
								}),
						);

						const snapshots = dryRun
							? undefined
							: await runRequiredStep(steps, "snapshot_before_apply", () =>
									snapshotFiles(
										root,
										converted.payload.files.map((file) => file.path),
									),
								);
						const writtenContentByPath = new Map(
							converted.payload.files.map((file) => [file.path, file.content]),
						);

						const applyResult = await runRequiredStep(
							steps,
							"apply_files",
							() =>
								applyGeneratedFiles({
									files: converted.payload.files,
									targetRoot: root,
									dryRun,
									rollbackOnError: true,
								}),
						);

						const consistentApplyResult: ShipPayloadBase["apply"] = {
							...applyResult,
						};
						const quality = await runRequiredStep(steps, "quality_gate", () =>
							runQualityGate({
								files: converted.payload.files,
								targetRoot: root,
								runCommands,
								uiuxScore,
								uiuxThreshold,
							}),
						);

						if (!quality.passed && !dryRun && applyResult.written?.length) {
							const rollback = await runRequiredStep(
								steps,
								"rollback_on_quality_fail",
								() =>
									rollbackWrittenFiles(
										root,
										applyResult.written || [],
										snapshots || new Map(),
										writtenContentByPath,
									),
							);
							consistentApplyResult.rolledBack = rollback.rolledBack;
							consistentApplyResult.rollbackDetails = rollback.rollbackDetails;
							consistentApplyResult.rollbackReason = "quality_gate_failed";

							if (!rollback.rolledBack) {
								throw new Error(
									"Quality gate failed and rollback did not complete successfully.",
								);
							}
						}

						const basePayload: ShipPayloadBase = {
							workspaceRoot: path.resolve(root),
							detection: converted.detection,
							html: makePageText,
							files: converted.payload.files,
							notes: converted.payload.notes,
							apply: consistentApplyResult,
							quality,
						};

						if (quality.passed) {
							await runRequiredStep(steps, "idempotency_store", () =>
								execution.lease.complete(basePayload),
							);
						} else {
							await runBestEffortStep(steps, "idempotency_lease_abandon", () =>
								execution.lease.abandon(),
							);
						}

						return { payload: basePayload, idempotencyHit: false };
					} catch (error) {
						await runBestEffortStep(steps, "idempotency_lease_abandon", () =>
							execution.lease.abandon(),
						);
						throw error;
					} finally {
						stopHeartbeat();
					}
				};

				const singleFlight = await runRequiredStep(
					steps,
					"idempotency_singleflight",
					() => runSingleFlightByKey(effectiveIdempotencyKey, runPipeline),
				);
				const payloadFromSingleFlight = singleFlight.value.payload;
				const idempotencyHit =
					singleFlight.shared || singleFlight.value.idempotencyHit;

				return textResult(
					JSON.stringify(
						{
							...payloadFromSingleFlight,
							steps,
							summary: buildSummary(
								payloadFromSingleFlight,
								Boolean(idempotencyHit),
							),
						},
						null,
						2,
					),
				);
			}),
	);
}

export const __test__ = {
	buildSummary,
	rollbackWrittenFiles,
	snapshotFiles,
};
