import { spawn } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	GeminiPythonSidecarBridge,
	GeminiSidecarBridgeError,
} from "../services/mcp-server/src/providers/gemini-python-sidecar.js";

function requestOnce(
	proc: ReturnType<typeof spawn>,
	payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let timeout: NodeJS.Timeout | null = null;
		const done = (fn: () => void) => {
			if (settled) {
				return;
			}
			settled = true;
			if (timeout) {
				clearTimeout(timeout);
				timeout = null;
			}
			fn();
		};

		const onData = (chunk: Buffer | string) => {
			const line = String(chunk).trim();
			if (!line) {
				return;
			}
			done(() => {
				proc.stdout?.off("data", onData);
				try {
					resolve(JSON.parse(line) as Record<string, unknown>);
				} catch (error) {
					reject(error);
				}
			});
		};

		proc.stdout?.on("data", onData);
		proc.stdin?.write(`${JSON.stringify(payload)}\n`);

		timeout = setTimeout(() => {
			done(() => {
				proc.stdout?.off("data", onData);
				reject(new Error("sidecar contract test timed out"));
			});
		}, 15_000);
	});
}

function waitForProcessExit(
	proc: ReturnType<typeof spawn>,
	timeoutMs: number,
): Promise<void> {
	if (proc.exitCode !== null || proc.signalCode !== null) {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		let settled = false;
		const done = () => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			proc.off("exit", done);
			resolve();
		};

		const timeout = setTimeout(done, timeoutMs);
		proc.once("exit", done);
	});
}

const ENV_KEYS = [
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"OPENUI_MODEL_ROUTING",
	"OPENUI_MAX_RETRIES",
	"OPENUI_RETRY_BASE_MS",
] as const;
const originalEnv = new Map<string, string | undefined>(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	vi.restoreAllMocks();
	vi.doUnmock("../services/mcp-server/src/providers/gemini-provider.js");
	vi.doUnmock("../services/mcp-server/src/logger.js");
	vi.resetModules();
});

describe("gemini sidecar contract", () => {
	it("returns JSON-RPC health response", async () => {
		const scriptPath = path.resolve(process.cwd(), "services/gemini-sidecar/server.py");
		const proc = spawn(
			process.env.OPENUI_GEMINI_PYTHON_BIN || "python3",
			[scriptPath],
			{
				stdio: ["pipe", "pipe", "pipe"],
				env: process.env,
			},
		);

		try {
			const response = await requestOnce(proc, {
				jsonrpc: "2.0",
				id: 1,
				method: "health",
				params: {},
			});

			expect(response.jsonrpc).toBe("2.0");
			expect(response.id).toBe(1);
			const result = response.result as Record<string, unknown>;
			expect(result.status).toBe("ok");
			const sdk = result.sdk as Record<string, unknown>;
			expect(typeof sdk.name).toBe("string");
		} finally {
			proc.kill("SIGKILL");
			await waitForProcessExit(proc, 3_000);
		}
	}, 15_000);

	it("handles concurrent start/stop calls without lifecycle race failures", async () => {
		const scriptPath = path.resolve(process.cwd(), "services/gemini-sidecar/server.py");
		const bridge = new GeminiPythonSidecarBridge({
			scriptPath,
			startupTimeoutMs: 8_000,
			requestTimeoutMs: 8_000,
		});

		await Promise.all([bridge.start(), bridge.start()]);
		const health = await bridge.request<{ status: string }>("health", {});
		expect(health.status).toBe("ok");

		await Promise.all([bridge.stop(), bridge.stop()]);
		await expect(bridge.request("health", {})).resolves.toEqual(
			expect.objectContaining({ status: "ok" }),
		);
		await bridge.stop();
	}, 15_000);
});

describe("gemini sidecar retry contract", () => {
	it("retries sidecar remote 5xx status and records durationMs", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "1";
		process.env.OPENUI_RETRY_BASE_MS = "1";

		const requestId = "req-sidecar-503";
		const remoteError = Object.assign(new Error("Gemini API request failed"), {
			code: "SIDECAR_REMOTE_ERROR",
			details: {
				requestId,
				rpcError: {
					code: -32000,
					data: {
						status: 503,
					},
				},
			},
		});

		const completeWithGemini = vi
			.fn(async () => "retry-ok")
			.mockRejectedValueOnce(remoteError);

		const logDebug = vi.fn();
		const logInfo = vi.fn();
		const logWarn = vi.fn();
		const logError = vi.fn();

		vi.doMock("../services/mcp-server/src/logger.js", () => ({
			logDebug,
			logInfo,
			logWarn,
			logError,
		}));
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");

		const result = await aiClient.aiChatComplete({
			prompt: "hello",
			routeKey: "strong",
			requestId,
		});

		expect(result).toBe("retry-ok");
		expect(completeWithGemini).toHaveBeenCalledTimes(2);
		expect(completeWithGemini.mock.calls[0]?.[0]?.requestId).toBe(requestId);
		expect(logInfo).toHaveBeenCalledWith(
			"ai_model_resolved",
			expect.objectContaining({
				requestId,
				traceId: requestId,
				stage: "model_resolution",
			}),
		);
		expect(logWarn).toHaveBeenCalledTimes(1);
		expect(logWarn.mock.calls[0]?.[0]).toBe("ai_request_retry");
		expect(logWarn.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				requestId,
				traceId: requestId,
				stage: "completion",
				errorType: "SIDECAR_REMOTE_ERROR",
				status: 503,
				durationMs: expect.any(Number),
			}),
		);
		expect(logDebug).toHaveBeenCalledWith(
			"ai_request_success",
			expect.objectContaining({
				requestId,
				traceId: requestId,
				stage: "completion",
				durationMs: expect.any(Number),
			}),
		);
		const retryDuration = Number(logWarn.mock.calls[0]?.[1]?.durationMs);
		expect(retryDuration).toBeGreaterThanOrEqual(0);
	});

	it("does not retry sidecar remote 4xx status and records durationMs on failure", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "2";
		process.env.OPENUI_RETRY_BASE_MS = "1";

		const requestId = "req-sidecar-400";
		const remoteError = Object.assign(new Error("Gemini API request failed"), {
			code: "SIDECAR_REMOTE_ERROR",
			details: {
				requestId,
				rpcError: {
					code: -32000,
					data: {
						status: 400,
					},
				},
			},
		});
		const completeWithGemini = vi
			.fn(async () => "unused")
			.mockRejectedValue(remoteError);

		const logDebug = vi.fn();
		const logInfo = vi.fn();
		const logWarn = vi.fn();
		const logError = vi.fn();

		vi.doMock("../services/mcp-server/src/logger.js", () => ({
			logDebug,
			logInfo,
			logWarn,
			logError,
		}));
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");

		await expect(
			aiClient.aiChatComplete({
				prompt: "hello",
				routeKey: "strong",
				requestId,
			}),
		).rejects.toThrow("Gemini API request failed");

		expect(completeWithGemini).toHaveBeenCalledTimes(1);
		expect(logWarn).not.toHaveBeenCalled();
		expect(logError).toHaveBeenCalledWith(
			"ai_request_failed",
			expect.objectContaining({
				requestId,
				traceId: requestId,
				stage: "completion",
				errorType: "SIDECAR_REMOTE_ERROR",
				status: 400,
				durationMs: expect.any(Number),
			}),
		);
	});

	it("keeps requestId in sidecar bridge remote error details", () => {
		const bridge = new GeminiPythonSidecarBridge();
		const sidecarRequestId = 7;
		const timer = setTimeout(() => undefined, 1_000);
		let rejected: unknown;

		const bridgeState = bridge as unknown as {
			pending: Map<
				number,
				{
					method: string;
					requestId?: string;
					sidecarRequestId: number;
					timer: NodeJS.Timeout;
					resolve: (value: unknown) => void;
					reject: (reason: Error) => void;
				}
			>;
			handleLine: (line: string) => void;
		};

		bridgeState.pending.set(sidecarRequestId, {
			method: "generate_content",
			requestId: "req-bridge-remote",
			sidecarRequestId,
			timer,
			resolve: () => undefined,
			reject: (error: Error) => {
				clearTimeout(timer);
				rejected = error;
			},
		});

		bridgeState.handleLine(
			JSON.stringify({
				jsonrpc: "2.0",
				id: sidecarRequestId,
				error: {
					code: -32000,
					message: "Gemini API request failed",
					data: {
						status: 503,
					},
				},
			}),
		);

		expect(rejected).toBeInstanceOf(GeminiSidecarBridgeError);
		const bridgeError = rejected as GeminiSidecarBridgeError;
		expect(bridgeError.message).toContain("requestId=req-bridge-remote");
		expect(bridgeError.details?.requestId).toBe("req-bridge-remote");
		expect(bridgeError.details?.sidecarRequestId).toBe(sidecarRequestId);
		const rpcError = bridgeError.details?.rpcError as {
			data?: { status?: number };
		};
		expect(rpcError.data?.status).toBe(503);
	});
});
