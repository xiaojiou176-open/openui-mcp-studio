import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resetGeminiProviderForTests } from "../services/mcp-server/src/public/provider-testing.js";
import {
	GeminiPythonSidecarBridge,
	GeminiSidecarBridgeError,
} from "../services/mcp-server/src/public/provider-testing.js";
import { registerComputerUseTool } from "../services/mcp-server/src/public/computer-use.js";
import {
	formatErrorTypes,
	type StressRecord,
	summarizeByOperation,
} from "./stress-metrics.ts";

type StressTarget = "sidecar" | "computer-use" | "all";

type CliOptions = {
	target: StressTarget;
	concurrency: number;
	rounds: number;
	timeoutMs: number;
	realModel: boolean;
	outputPath: string;
};

type ToolTextResult = {
	content?: Array<{ type?: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolTextResult>;

const DEFAULT_OPTIONS: CliOptions = {
	target: "all",
	concurrency: 2,
	rounds: 5,
	timeoutMs: 30_000,
	realModel: false,
	outputPath: path.resolve(
		process.cwd(),
		".runtime-cache",
		"stress",
		"latest.json",
	),
};

function parseBoolean(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) {
		return true;
	}
	if (["0", "false", "no", "off"].includes(normalized)) {
		return false;
	}
	throw new Error(`Invalid boolean value: ${JSON.stringify(value)}`);
}

function parsePositiveInt(value: string, flag: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(
			`${flag} must be a positive integer, received: ${JSON.stringify(value)}.`,
		);
	}
	return parsed;
}

function parseArgs(argv: string[]): CliOptions {
	const options = { ...DEFAULT_OPTIONS };

	for (let index = 0; index < argv.length; index += 1) {
		const rawArg = argv[index] ?? "";
		const [arg, inlineValue] = rawArg.includes("=")
			? rawArg.split("=", 2)
			: [rawArg, undefined];
		const value = inlineValue ?? argv[index + 1];

		if (arg === "--target") {
			const target = String(value ?? "").trim();
			if (
				target !== "sidecar" &&
				target !== "computer-use" &&
				target !== "all"
			) {
				throw new Error(
					`--target must be one of sidecar|computer-use|all, received: ${JSON.stringify(target)}`,
				);
			}
			options.target = target;
			if (inlineValue === undefined) {
				index += 1;
			}
			continue;
		}

		if (arg === "--concurrency") {
			options.concurrency = parsePositiveInt(
				String(value ?? ""),
				"--concurrency",
			);
			if (inlineValue === undefined) {
				index += 1;
			}
			continue;
		}

		if (arg === "--rounds") {
			options.rounds = parsePositiveInt(String(value ?? ""), "--rounds");
			if (inlineValue === undefined) {
				index += 1;
			}
			continue;
		}

		if (arg === "--timeout-ms") {
			options.timeoutMs = parsePositiveInt(String(value ?? ""), "--timeout-ms");
			if (inlineValue === undefined) {
				index += 1;
			}
			continue;
		}

		if (arg === "--real-model") {
			options.realModel = parseBoolean(String(value ?? "true"));
			if (inlineValue === undefined) {
				index += 1;
			}
			continue;
		}

		if (arg === "--output") {
			options.outputPath = path.resolve(process.cwd(), String(value ?? ""));
			if (inlineValue === undefined) {
				index += 1;
			}
			continue;
		}

		throw new Error(`Unknown argument: ${rawArg}`);
	}

	return options;
}

function classifyError(error: unknown): string {
	if (error instanceof GeminiSidecarBridgeError) {
		return error.code;
	}

	if (error instanceof Error) {
		return error.name || "Error";
	}

	return "UNKNOWN_ERROR";
}

function createToolHarness(): { getHandler: (name: string) => ToolHandler } {
	const handlers = new Map<string, ToolHandler>();
	const server = {
		registerTool(name: string, _config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid handler for tool ${name}`);
			}
			handlers.set(name, handler as ToolHandler);
		},
	} as unknown as McpServer;

	registerComputerUseTool(server);

	return {
		getHandler(name: string) {
			const handler = handlers.get(name);
			if (!handler) {
				throw new Error(`Missing tool handler: ${name}`);
			}
			return handler;
		},
	};
}

function parseToolPayload(result: ToolTextResult): Record<string, unknown> {
	const textBlock = (result.content ?? []).find((item) => item.type === "text");
	const text = textBlock?.text;
	if (!text || !text.trim()) {
		throw new Error("Tool result missing text content.");
	}

	return JSON.parse(text) as Record<string, unknown>;
}

function getModelName(): string {
	const model =
		process.env.GEMINI_MODEL_STRONG ||
		process.env.GEMINI_MODEL ||
		"gemini-2.5-flash";
	return model.trim();
}

async function runSidecarStress(options: CliOptions): Promise<StressRecord[]> {
	const records: StressRecord[] = [];
	const bridge = new GeminiPythonSidecarBridge({
		pythonBin: process.env.OPENUI_GEMINI_PYTHON_BIN || "python3",
		scriptPath: path.resolve(
			process.cwd(),
			process.env.OPENUI_GEMINI_SIDECAR_PATH || "services/gemini-sidecar/server.py",
		),
		requestTimeoutMs: options.timeoutMs,
		startupTimeoutMs: Math.min(options.timeoutMs, 8_000),
		env: {
			GEMINI_API_KEY: process.env.GEMINI_API_KEY,
		},
	});

	const model = getModelName();

	const executeAndRecord = async (
		operation: string,
		request: () => Promise<unknown>,
	) => {
		const startedAt = performance.now();
		try {
			await request();
			records.push({
				target: "sidecar",
				operation,
				ok: true,
				latencyMs: Number((performance.now() - startedAt).toFixed(2)),
			});
		} catch (error) {
			records.push({
				target: "sidecar",
				operation,
				ok: false,
				latencyMs: Number((performance.now() - startedAt).toFixed(2)),
				errorType: classifyError(error),
				extra: {
					message: error instanceof Error ? error.message : String(error),
				},
			});
		}
	};

	try {
		await bridge.start();

		await Promise.all(
			Array.from(
				{ length: options.concurrency },
				async (_item, workerIndex) => {
					for (let round = 0; round < options.rounds; round += 1) {
						await executeAndRecord("health", async () =>
							bridge.request("health", {}, options.timeoutMs),
						);
						await executeAndRecord("list_models", async () =>
							bridge.request(
								"list_models",
								{
									limit: 3,
								},
								options.timeoutMs,
							),
						);

						if (options.realModel) {
							await executeAndRecord("generate_content", async () =>
								bridge.request(
									"generate_content",
									{
										model,
										contents: [
											{
												role: "user",
												parts: [
													{
														text: `stress-check worker=${workerIndex} round=${round}: reply with OK`,
													},
												],
											},
										],
										temperature: 0.2,
										thinking_level: "low",
									},
									options.timeoutMs,
								),
							);
						}
					}
				},
			),
		);
	} finally {
		await bridge.stop();
	}

	return records;
}

function buildComputerUseInput(input: {
	mode: "low-risk" | "high-risk-unconfirmed" | "high-risk-confirmed";
	workerIndex: number;
	round: number;
	realModel: boolean;
}): {
	payload: Record<string, unknown>;
	expectedStatus: "ok" | "blocked_confirmation";
} {
	const common = {
		sessionId: `worker-${input.workerIndex}`,
		input: {
			text: `stress worker=${input.workerIndex}, round=${input.round}`,
		},
		maxSteps: 3,
	};

	if (input.mode === "low-risk") {
		return {
			expectedStatus: "ok",
			payload: {
				...common,
				requireConfirmation: true,
				confirmed: false,
				invokeModel: input.realModel,
				plannedActions: [
					{ type: "observe", target: "#app", risk: "low" },
					{ type: "click", target: "#run", risk: "low" },
					{ type: "wait", value: "200ms", risk: "low" },
				],
			},
		};
	}

	if (input.mode === "high-risk-unconfirmed") {
		return {
			expectedStatus: "blocked_confirmation",
			payload: {
				...common,
				requireConfirmation: true,
				confirmed: false,
				invokeModel: input.realModel,
				plannedActions: [
					{
						type: "file_delete",
						target: "/tmp/stress-check.txt",
						risk: "high",
					},
				],
			},
		};
	}

	return {
		expectedStatus: "ok",
		payload: {
			...common,
			requireConfirmation: true,
			confirmed: true,
			invokeModel: input.realModel,
			plannedActions: [
				{ type: "file_delete", target: "/tmp/stress-check.txt", risk: "high" },
			],
		},
	};
}

async function runComputerUseStress(
	options: CliOptions,
): Promise<StressRecord[]> {
	const records: StressRecord[] = [];
	// Computer-use loop invokes the shared Gemini provider bridge; allow extra headroom
	// under real-model stress to avoid false negatives caused by queueing latency.
	if (options.realModel) {
		const timeoutForComputerUseMs = Math.max(options.timeoutMs * 2, 90_000);
		process.env.OPENUI_TIMEOUT_MS = String(timeoutForComputerUseMs);
	}
	const harness = createToolHarness();
	const handler = harness.getHandler("openui_computer_use_loop");
	const maxAttempts = options.realModel ? 3 : 1;

	const invokeWithRetry = async (payload: Record<string, unknown>) => {
		let lastError: unknown;
		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				return await handler(payload);
			} catch (error) {
				lastError = error;
				const code = classifyError(error);
				const retryable =
					code === "SIDECAR_TIMEOUT" || code === "SIDECAR_REMOTE_ERROR";
				if (!retryable || attempt >= maxAttempts) {
					throw error;
				}
			}
		}
		throw lastError;
	};
	const modes: Array<
		"low-risk" | "high-risk-unconfirmed" | "high-risk-confirmed"
	> = ["low-risk", "high-risk-unconfirmed", "high-risk-confirmed"];

	try {
		await Promise.all(
			Array.from(
				{ length: options.concurrency },
				async (_item, workerIndex) => {
					for (let round = 0; round < options.rounds; round += 1) {
						const mode = modes[(workerIndex + round) % modes.length] as
							| "low-risk"
							| "high-risk-unconfirmed"
							| "high-risk-confirmed";
						const { payload, expectedStatus } = buildComputerUseInput({
							mode,
							workerIndex,
							round,
							realModel: options.realModel,
						});

						const startedAt = performance.now();
						try {
							const result = await invokeWithRetry(payload);
							const parsed = parseToolPayload(result);
							const status = parsed.status;
							if (status !== expectedStatus) {
								throw new Error(
									`unexpected_status expected=${expectedStatus} actual=${JSON.stringify(status)} mode=${mode}`,
								);
							}

							if (expectedStatus === "blocked_confirmation") {
								const blockedActions = parsed.blockedActions;
								if (
									!Array.isArray(blockedActions) ||
									blockedActions.length === 0
								) {
									throw new Error(
										`blocked_confirmation_missing_actions mode=${mode}`,
									);
								}
							}

							records.push({
								target: "computer-use",
								operation: mode,
								ok: true,
								latencyMs: Number((performance.now() - startedAt).toFixed(2)),
								extra: {
									status,
								},
							});
						} catch (error) {
							records.push({
								target: "computer-use",
								operation: mode,
								ok: false,
								latencyMs: Number((performance.now() - startedAt).toFixed(2)),
								errorType: classifyError(error),
								extra: {
									message:
										error instanceof Error ? error.message : String(error),
								},
							});
						}
					}
				},
			),
		);
	} finally {
		await resetGeminiProviderForTests();
	}

	return records;
}

function printSummary(summary: ReturnType<typeof summarizeByOperation>): void {
	console.log(
		"| target | operation | total | success | failure | successRate | p50(ms) | p95(ms) | throughput(rps) | errorTypes |",
	);
	console.log(
		"| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
	);
	for (const item of summary) {
		console.log(
			`| ${item.target} | ${item.operation} | ${item.total} | ${item.success} | ${item.failure} | ${item.successRate}% | ${item.p50Ms} | ${item.p95Ms} | ${item.throughputRps} | ${formatErrorTypes(item.errorTypes)} |`,
		);
	}
}

async function writeReport(input: {
	options: CliOptions;
	records: StressRecord[];
	elapsedMs: number;
	summary: ReturnType<typeof summarizeByOperation>;
}): Promise<void> {
	await fs.mkdir(path.dirname(input.options.outputPath), { recursive: true });
	const report = {
		generatedAt: new Date().toISOString(),
		options: input.options,
		elapsedMs: Number(input.elapsedMs.toFixed(2)),
		summary: input.summary,
		records: input.records,
	};
	await fs.writeFile(
		input.options.outputPath,
		`${JSON.stringify(report, null, 2)}\n`,
		"utf8",
	);
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.realModel && !process.env.GEMINI_API_KEY) {
		throw new Error("--real-model=true requires GEMINI_API_KEY.");
	}

	const startedAt = performance.now();
	const records: StressRecord[] = [];

	if (options.target === "sidecar" || options.target === "all") {
		records.push(...(await runSidecarStress(options)));
	}
	if (options.target === "computer-use" || options.target === "all") {
		records.push(...(await runComputerUseStress(options)));
	}

	const elapsedMs = performance.now() - startedAt;
	const summary = summarizeByOperation({ records, elapsedMs });

	console.log("# Stress Parameters");
	console.log(JSON.stringify(options, null, 2));
	console.log("\n# Stress Result Summary");
	printSummary(summary);

	await writeReport({
		options,
		records,
		elapsedMs,
		summary,
	});

	const failed = records.filter((record) => !record.ok).length;
	console.log(`\nreport: ${options.outputPath}`);
	console.log(`requests: ${records.length}, failed: ${failed}`);

	if (failed > 0) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(
		error instanceof Error ? error.stack || error.message : String(error),
	);
	process.exitCode = 1;
});
