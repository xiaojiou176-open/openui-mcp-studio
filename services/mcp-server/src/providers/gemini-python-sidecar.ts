import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "node:path";
import { getGeminiSidecarStdoutBufferMaxBytes } from "../constants.js";
import { logDebug, logError, logInfo, logWarn } from "../logger.js";
import { buildChildEnvFromAllowlist } from "../../../../packages/shared-runtime/src/child-env.js";

type JsonRpcId = number | string;

type JsonRpcSuccessResponse = {
	jsonrpc: "2.0";
	id: JsonRpcId | null;
	result: unknown;
};

type PendingRequest = {
	method: string;
	requestId?: string;
	sidecarRequestId: JsonRpcId;
	timer: NodeJS.Timeout;
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
};

export type GeminiSidecarBridgeErrorCode =
	| "SIDECAR_NOT_RUNNING"
	| "SIDECAR_SPAWN_FAILED"
	| "SIDECAR_WRITE_FAILED"
	| "SIDECAR_TIMEOUT"
	| "SIDECAR_PROTOCOL_ERROR"
	| "SIDECAR_REMOTE_ERROR"
	| "SIDECAR_PROCESS_EXITED";

export class GeminiSidecarBridgeError extends Error {
	public readonly code: GeminiSidecarBridgeErrorCode;
	public readonly details?: Record<string, unknown>;

	public constructor(
		code: GeminiSidecarBridgeErrorCode,
		message: string,
		details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "GeminiSidecarBridgeError";
		this.code = code;
		this.details = details;
	}
}

export type GeminiPythonSidecarBridgeOptions = {
	pythonBin?: string;
	scriptPath?: string;
	requestTimeoutMs?: number;
	startupTimeoutMs?: number;
	stdoutBufferMaxBytes?: number;
	env?: NodeJS.ProcessEnv;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 8_000;
const DEFAULT_STDERR_LIMIT = 8_192;
const MAX_STDERR_PREVIEW_CHARS = 200;

function trimStderrPreview(stderr: string): string {
	if (!stderr) {
		return "";
	}
	return stderr.slice(-MAX_STDERR_PREVIEW_CHARS);
}

function formatErrorMessage(message: string, requestId?: string): string {
	if (!requestId) {
		return message;
	}
	return `${message} [requestId=${requestId}]`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;
}

function formatRemoteErrorMessage(
	message: string,
	data: Record<string, unknown> | undefined,
): string {
	const parts = [message];
	const errorType =
		typeof data?.error_type === "string" ? data.error_type.trim() : "";
	const detail = typeof data?.message === "string" ? data.message.trim() : "";
	const status = data?.status;
	if (errorType) {
		parts.push(`type=${errorType}`);
	}
	if (status !== undefined && status !== null && String(status).trim()) {
		parts.push(`status=${String(status).trim()}`);
	}
	if (detail && detail !== message) {
		parts.push(`detail=${detail}`);
	}
	return parts.join("; ");
}

export class GeminiPythonSidecarBridge {
	private readonly options: Required<
		Omit<GeminiPythonSidecarBridgeOptions, "env">
	> & { env?: NodeJS.ProcessEnv };

	private child: ChildProcessWithoutNullStreams | null = null;
	private nextRequestId = 1;
	private stdoutBuffer = "";
	private stderrTail = "";
	private stdoutOverflowed = false;
	private readonly pending = new Map<JsonRpcId, PendingRequest>();
	private isStopping = false;
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;

	public constructor(options: GeminiPythonSidecarBridgeOptions = {}) {
		const pythonBin =
			options.pythonBin?.trim() ||
			process.env.OPENUI_GEMINI_PYTHON_BIN?.trim() ||
			"python3";
		const scriptPath =
			options.scriptPath?.trim() ||
			process.env.OPENUI_GEMINI_SIDECAR_PATH?.trim() ||
			path.resolve(process.cwd(), "services/gemini-sidecar/server.py");
		this.options = {
			pythonBin,
			scriptPath,
			requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
			startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
			stdoutBufferMaxBytes:
				typeof options.stdoutBufferMaxBytes === "number" &&
				Number.isInteger(options.stdoutBufferMaxBytes) &&
				options.stdoutBufferMaxBytes > 0
					? options.stdoutBufferMaxBytes
					: getGeminiSidecarStdoutBufferMaxBytes(),
			env: options.env,
		};
	}

	public async start(): Promise<void> {
		if (this.stopPromise) {
			await this.stopPromise;
		}
		if (this.child) {
			return;
		}
		if (this.startPromise) {
			await this.startPromise;
			return;
		}
		this.startPromise = this.doStart();
		try {
			await this.startPromise;
		} finally {
			this.startPromise = null;
		}
	}

	private async doStart(): Promise<void> {
		const baseEnv = buildChildEnvFromAllowlist(process.env);
		const env: NodeJS.ProcessEnv = {
			...baseEnv,
			...this.options.env,
			PYTHONUNBUFFERED: "1",
		};

		const child = spawn(this.options.pythonBin, [this.options.scriptPath], {
			stdio: ["pipe", "pipe", "pipe"],
			env,
		});

		this.stdoutBuffer = "";
		this.stderrTail = "";
		this.stdoutOverflowed = false;
		this.child = child;
		logInfo("sidecar_starting", {
			stage: "startup",
			traceId: "sidecar_runtime",
			context: {
				pythonBin: this.options.pythonBin,
				scriptPath: this.options.scriptPath,
			},
		});
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");

		child.stdout.on("data", (chunk: string) => {
			this.handleStdout(chunk);
		});
		child.stderr.on("data", (chunk: string) => {
			this.captureStderr(chunk);
		});
		child.on("error", (error: Error) => {
			logError("sidecar_spawn_failed", {
				stage: "startup",
				traceId: "sidecar_runtime",
				errorType: "SIDECAR_SPAWN_FAILED",
				errorName: error.name,
				context: {
					pythonBin: this.options.pythonBin,
					scriptPath: this.options.scriptPath,
				},
				error: error.message,
			});
			this.rejectAllPending(
				new GeminiSidecarBridgeError(
					"SIDECAR_SPAWN_FAILED",
					"Failed to start Gemini sidecar process.",
					{
						message: error.message,
						pythonBin: this.options.pythonBin,
						scriptPath: this.options.scriptPath,
					},
				),
			);
		});
		child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
			const wasStopping = this.isStopping;
			this.child = null;
			this.isStopping = false;
			if (!wasStopping) {
				logError("sidecar_process_exited_unexpectedly", {
					stage: "runtime",
					traceId: "sidecar_runtime",
					errorType: "SIDECAR_PROCESS_EXITED",
					context: {
						code,
						signal,
						stderrPreview: trimStderrPreview(this.stderrTail),
					},
					error: "Gemini sidecar process exited unexpectedly.",
				});
				this.rejectAllPending(
					new GeminiSidecarBridgeError(
						"SIDECAR_PROCESS_EXITED",
						"Gemini sidecar process exited unexpectedly.",
						{
							code,
							signal,
							stderr: this.stderrTail,
						},
					),
				);
			}
		});

		const awaitStartupHealth = async (): Promise<void> =>
			await new Promise<void>((resolve, reject) => {
				const onCloseBeforeReady = (
					code: number | null,
					signal: NodeJS.Signals | null,
				): void => {
					child.off("close", onCloseBeforeReady);
					reject(
						new GeminiSidecarBridgeError(
							"SIDECAR_PROCESS_EXITED",
							"Gemini sidecar process exited before startup health check completed.",
							{
								code,
								signal,
								stderr: this.stderrTail,
							},
						),
					);
				};

				child.on("close", onCloseBeforeReady);
				void this.request("health", {}, this.options.startupTimeoutMs)
					.then(() => {
						child.off("close", onCloseBeforeReady);
						resolve();
					})
					.catch((error: unknown) => {
						child.off("close", onCloseBeforeReady);
						reject(error);
					});
			});

		try {
			await awaitStartupHealth();
			logInfo("sidecar_ready", {
				stage: "startup",
				traceId: "sidecar_runtime",
				context: {
					pendingRequests: this.pending.size,
				},
			});
		} catch (error) {
			const bridgeDetails =
				error instanceof GeminiSidecarBridgeError ? error.details : undefined;
			logError("sidecar_startup_health_failed", {
				stage: "startup",
				traceId: "sidecar_runtime",
				errorType:
					error instanceof GeminiSidecarBridgeError
						? error.code
						: "SIDECAR_SPAWN_FAILED",
				errorName: error instanceof Error ? error.name : "Error",
				context: {
					pythonBin: this.options.pythonBin,
					scriptPath: this.options.scriptPath,
					bridgeErrorDetails: bridgeDetails,
				},
				error: error instanceof Error ? error.message : String(error),
			});
			await this.stop();
			if (error instanceof GeminiSidecarBridgeError) {
				throw error;
			}
			throw new GeminiSidecarBridgeError(
				"SIDECAR_SPAWN_FAILED",
				"Gemini sidecar startup health check failed.",
				{
					cause: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	public async stop(): Promise<void> {
		if (this.stopPromise) {
			await this.stopPromise;
			return;
		}
		this.stopPromise = this.doStop();
		try {
			await this.stopPromise;
		} finally {
			this.stopPromise = null;
		}
	}

	private async doStop(): Promise<void> {
		const child = this.child;
		if (!child) {
			return;
		}

		this.isStopping = true;
		this.child = null;
		logInfo("sidecar_stopping", {
			stage: "shutdown",
			traceId: "sidecar_runtime",
			context: {
				pendingRequests: this.pending.size,
			},
		});

		await new Promise<void>((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) {
					return;
				}
				settled = true;
				resolve();
			};

			const timeout = setTimeout(() => {
				child.kill("SIGKILL");
				finish();
			}, 1_000);

			child.once("close", () => {
				clearTimeout(timeout);
				finish();
			});

			child.kill("SIGTERM");
		});

		this.rejectAllPending(
			new GeminiSidecarBridgeError(
				"SIDECAR_NOT_RUNNING",
				"Gemini sidecar is not running.",
			),
		);
		logInfo("sidecar_stopped", {
			stage: "shutdown",
			traceId: "sidecar_runtime",
			context: {
				pendingRequests: this.pending.size,
			},
		});
	}

	public async request<T = unknown>(
		method: string,
		params: Record<string, unknown> = {},
		timeoutMs: number = this.options.requestTimeoutMs,
		context: { requestId?: string } = {},
	): Promise<T> {
		const requestId = context.requestId?.trim() || undefined;

		if (!this.child) {
			await this.start();
		}

		if (!this.child) {
			throw new GeminiSidecarBridgeError(
				"SIDECAR_NOT_RUNNING",
				"Gemini sidecar is not running.",
			);
		}

		const sidecarRequestId = this.nextRequestId++;
		const payload = `${JSON.stringify({
			jsonrpc: "2.0",
			id: sidecarRequestId,
			method,
			params,
		})}\n`;

		return await new Promise<T>((resolve, reject) => {
			logDebug("sidecar_request_sent", {
				requestId,
				traceId: requestId || "sidecar_runtime",
				stage: "request_dispatch",
				method,
				sidecarRequestId,
				context: {
					requestTimeoutMs: timeoutMs,
				},
			});
			const timer = setTimeout(() => {
				this.pending.delete(sidecarRequestId);
				logWarn("sidecar_request_timeout", {
					requestId,
					traceId: requestId || "sidecar_runtime",
					stage: "request_wait",
					errorType: "SIDECAR_TIMEOUT",
					method,
					timeoutMs,
					sidecarRequestId,
					context: {
						method,
						sidecarRequestId,
					},
					error: "Gemini sidecar request timed out.",
				});
				reject(
					new GeminiSidecarBridgeError(
						"SIDECAR_TIMEOUT",
						formatErrorMessage("Gemini sidecar request timed out.", requestId),
						{
							method,
							timeoutMs,
							requestId,
							sidecarRequestId,
						},
					),
				);
			}, timeoutMs);

			this.pending.set(sidecarRequestId, {
				method,
				requestId,
				sidecarRequestId,
				timer,
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value as T);
				},
				reject: (reason) => {
					clearTimeout(timer);
					reject(reason);
				},
			});

			this.child?.stdin.write(payload, (error?: Error | null) => {
				if (!error) {
					return;
				}

				const pending = this.pending.get(sidecarRequestId);
				if (!pending) {
					return;
				}

				this.pending.delete(sidecarRequestId);
				const activeChild = this.child;
				logError("sidecar_request_write_failed", {
					requestId: pending.requestId,
					traceId: pending.requestId || "sidecar_runtime",
					stage: "request_dispatch",
					errorType: "SIDECAR_WRITE_FAILED",
					errorName: error.name,
					context: {
						method,
						sidecarRequestId: pending.sidecarRequestId,
						childExitCode: activeChild?.exitCode ?? null,
						childSignalCode: activeChild?.signalCode ?? null,
						stderrPreview: trimStderrPreview(this.stderrTail),
					},
					error: error.message,
				});
				pending.reject(
					new GeminiSidecarBridgeError(
						"SIDECAR_WRITE_FAILED",
						formatErrorMessage(
							"Failed to write request to Gemini sidecar.",
							pending.requestId,
						),
						{
							method,
							message: error.message,
							requestId: pending.requestId,
							sidecarRequestId: pending.sidecarRequestId,
							stderr: this.stderrTail,
							childExitCode: activeChild?.exitCode ?? null,
							childSignalCode: activeChild?.signalCode ?? null,
						},
					),
				);
			});
		});
	}

	private captureStderr(chunk: string): void {
		this.stderrTail = `${this.stderrTail}${chunk}`.slice(-DEFAULT_STDERR_LIMIT);
	}

	private handleStdout(chunk: string): void {
		if (this.stdoutOverflowed) {
			return;
		}

		const nextBuffer = `${this.stdoutBuffer}${chunk}`;
		if (
			Buffer.byteLength(nextBuffer, "utf8") > this.options.stdoutBufferMaxBytes
		) {
			this.stdoutOverflowed = true;
			logError("sidecar_stdout_buffer_overflow", {
				stage: "response_parse",
				traceId: "sidecar_runtime",
				errorType: "SIDECAR_PROTOCOL_ERROR",
				context: {
					limitBytes: this.options.stdoutBufferMaxBytes,
				},
				error: "Sidecar stdout buffer exceeded configured maximum bytes.",
			});
			this.failProtocol("sidecar_stdout_buffer_limit_exceeded", {
				limitBytes: this.options.stdoutBufferMaxBytes,
			});
			return;
		}

		this.stdoutBuffer = nextBuffer;
		let newlineIndex = this.stdoutBuffer.indexOf("\n");
		while (newlineIndex >= 0) {
			const rawLine = this.stdoutBuffer.slice(0, newlineIndex);
			this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
			this.handleLine(rawLine.trim());
			newlineIndex = this.stdoutBuffer.indexOf("\n");
		}
	}

	private handleLine(line: string): void {
		if (!line) {
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (error) {
			logError("sidecar_stdout_json_parse_failed", {
				stage: "response_parse",
				traceId: "sidecar_runtime",
				errorType: "SIDECAR_PROTOCOL_ERROR",
				context: {
					lineBytes: Buffer.byteLength(line, "utf8"),
				},
				error: error instanceof Error ? error.message : String(error),
			});
			this.failProtocol("sidecar_stdout_not_json", {
				lineBytes: Buffer.byteLength(line, "utf8"),
				message: error instanceof Error ? error.message : String(error),
			});
			return;
		}

		const message = asRecord(parsed);
		if (
			!message ||
			message.jsonrpc !== "2.0" ||
			(typeof message.id !== "number" && typeof message.id !== "string")
		) {
			logError("sidecar_invalid_jsonrpc_message", {
				stage: "response_parse",
				traceId: "sidecar_runtime",
				errorType: "SIDECAR_PROTOCOL_ERROR",
				context: {
					hasJsonRpc: Boolean(message && "jsonrpc" in message),
					hasId: Boolean(message && "id" in message),
				},
				error: "Invalid JSON-RPC message from sidecar.",
			});
			this.failProtocol("sidecar_invalid_jsonrpc_message", {
				parsed: message ?? parsed,
			});
			return;
		}

		const requestId = message.id as JsonRpcId;
		const pending = this.pending.get(requestId);
		if (!pending) {
			return;
		}

		this.pending.delete(requestId);

		if ("error" in message) {
			const payload = asRecord(message.error);
			const code = typeof payload?.code === "number" ? payload.code : -32099;
			const errorMessage =
				typeof payload?.message === "string"
					? payload.message
					: "Gemini sidecar returned an unknown remote error.";
			const errorData = asRecord(payload?.data) ?? undefined;
			const detailedMessage = formatRemoteErrorMessage(errorMessage, errorData);

			logWarn("sidecar_remote_error", {
				requestId: pending.requestId,
				traceId: pending.requestId || "sidecar_runtime",
				stage: "response_parse",
				errorType: "SIDECAR_REMOTE_ERROR",
				context: {
					method: pending.method,
					sidecarRequestId: pending.sidecarRequestId,
					code,
					data: errorData,
				},
				error: detailedMessage,
			});
			pending.reject(
				new GeminiSidecarBridgeError(
					"SIDECAR_REMOTE_ERROR",
					formatErrorMessage(detailedMessage, pending.requestId),
					{
						method: pending.method,
						requestId: pending.requestId,
						sidecarRequestId: pending.sidecarRequestId,
						rpcError: {
							code,
							data: errorData,
						},
					},
				),
			);
			return;
		}

		if (!("result" in message)) {
			logError("sidecar_response_missing_result", {
				requestId: pending.requestId,
				traceId: pending.requestId || "sidecar_runtime",
				stage: "response_parse",
				errorType: "SIDECAR_PROTOCOL_ERROR",
				context: {
					method: pending.method,
					sidecarRequestId: pending.sidecarRequestId,
				},
				error: "Gemini sidecar response must include result or error.",
			});
			pending.reject(
				new GeminiSidecarBridgeError(
					"SIDECAR_PROTOCOL_ERROR",
					formatErrorMessage(
						"Gemini sidecar response must include result or error.",
						pending.requestId,
					),
					{
						method: pending.method,
						requestId: pending.requestId,
						sidecarRequestId: pending.sidecarRequestId,
						response: message,
					},
				),
			);
			return;
		}

		logDebug("sidecar_response_received", {
			requestId: pending.requestId,
			traceId: pending.requestId || "sidecar_runtime",
			stage: "response_parse",
			method: pending.method,
			sidecarRequestId: pending.sidecarRequestId,
			context: {
				method: pending.method,
				sidecarRequestId: pending.sidecarRequestId,
			},
		});
		pending.resolve((message as JsonRpcSuccessResponse).result);
	}

	private failProtocol(reason: string, details: Record<string, unknown>): void {
		logError("sidecar_protocol_violation", {
			stage: "response_parse",
			traceId: "sidecar_runtime",
			errorType: "SIDECAR_PROTOCOL_ERROR",
			context: {
				reason,
			},
			error: "Gemini sidecar protocol violation detected.",
		});
		const error = new GeminiSidecarBridgeError(
			"SIDECAR_PROTOCOL_ERROR",
			"Gemini sidecar protocol violation detected.",
			{ reason, ...details },
		);
		this.rejectAllPending(error);
		void this.stop();
	}

	private rejectAllPending(error: GeminiSidecarBridgeError): void {
		for (const [requestId, pending] of this.pending.entries()) {
			this.pending.delete(requestId);
			clearTimeout(pending.timer);
			logError("sidecar_request_rejected", {
				requestId: pending.requestId,
				traceId: pending.requestId || "sidecar_runtime",
				stage: "request_wait",
				errorType: error.code,
				context: {
					method: pending.method,
					sidecarRequestId: pending.sidecarRequestId,
				},
				error: error.message,
			});
			pending.reject(
				new GeminiSidecarBridgeError(error.code, error.message, {
					...error.details,
					method: pending.method,
					requestId: pending.requestId,
					sidecarRequestId: pending.sidecarRequestId,
				}),
			);
		}
	}
}

export type SidecarHealthResult = {
	status: "ok";
	sdk: {
		name: string;
		version: string;
	};
};

export type SidecarListModelsResult = {
	models: string[];
	count: number;
};

export type SidecarGenerateResult = {
	text: string;
	function_calls: Array<Record<string, unknown>>;
	safety_decisions: unknown[];
};

export type SidecarEmbedResult = {
	embeddings: number[][];
	count: number;
};
