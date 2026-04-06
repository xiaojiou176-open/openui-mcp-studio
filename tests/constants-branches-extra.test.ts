import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const RUNTIME_ENV_KEYS = [
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"OPENUI_MODEL_ROUTING",
	"OPENUI_MCP_LOG_DIR",
	"OPENUI_MCP_CACHE_DIR",
	"OPENUI_MCP_LOG_ROTATE_ON_START",
	"OPENUI_RUNTIME_RUN_ID",
	"OPENUI_MCP_WORKSPACE_ROOT",
	"OPENUI_QUEUE_MAX_PENDING",
	"OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES",
] as const;

const originalEnv = new Map<string, string | undefined>(
	RUNTIME_ENV_KEYS.map((key) => [key, process.env[key]]),
);
const tempDirs: string[] = [];

async function loadConstantsModule() {
	vi.resetModules();
	return import("../services/mcp-server/src/constants.js");
}

function restoreEnv() {
	for (const key of RUNTIME_ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
}

afterEach(async () => {
	restoreEnv();
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	vi.resetModules();
});

describe("constants branch coverage extras", () => {
	it("prefers explicit model and supports route-based fallback modes", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.GEMINI_MODEL_FAST = "gemini-fast";
		process.env.GEMINI_MODEL_STRONG = "gemini-strong";
		process.env.OPENUI_MODEL_ROUTING = "on";

		const { resolveOpenuiModel } = await loadConstantsModule();
		expect(resolveOpenuiModel({ explicitModel: "custom-model" })).toMatchObject(
			{
				resolvedModel: "custom-model",
				source: "explicit",
			},
		);
		expect(resolveOpenuiModel({ routeKey: "fast" })).toMatchObject({
			resolvedModel: "gemini-fast",
			source: "route",
		});
		expect(resolveOpenuiModel({ routeKey: "strong" })).toMatchObject({
			resolvedModel: "gemini-strong",
			source: "route",
		});
	});

	it("falls back to primary/default model when routing is off", async () => {
		process.env.GEMINI_MODEL = "gemini-primary";
		process.env.GEMINI_MODEL_FAST = "gemini-fast";
		process.env.OPENUI_MODEL_ROUTING = "off";

		const { resolveOpenuiModel } = await loadConstantsModule();
		expect(resolveOpenuiModel({ routeKey: "fast" })).toMatchObject({
			resolvedModel: "gemini-primary",
			source: "primary",
			routingMode: "off",
		});
	});

	it("uses primary model when strong model is explicitly blank", async () => {
		process.env.GEMINI_MODEL = "gemini-primary";
		process.env.GEMINI_MODEL_STRONG = "   ";

		const { getGeminiModelStrong } = await loadConstantsModule();
		expect(getGeminiModelStrong()).toEqual({
			model: "gemini-primary",
			source: "default",
		});
	});

	it("uses default queue max pending for empty/invalid values", async () => {
		const { DEFAULT_OPENUI_QUEUE_MAX_PENDING, getOpenuiQueueMaxPending } =
			await loadConstantsModule();

		delete process.env.OPENUI_QUEUE_MAX_PENDING;
		expect(getOpenuiQueueMaxPending()).toBe(DEFAULT_OPENUI_QUEUE_MAX_PENDING);

		process.env.OPENUI_QUEUE_MAX_PENDING = "  ";
		expect(getOpenuiQueueMaxPending()).toBe(DEFAULT_OPENUI_QUEUE_MAX_PENDING);

		process.env.OPENUI_QUEUE_MAX_PENDING = "-1";
		expect(getOpenuiQueueMaxPending()).toBe(DEFAULT_OPENUI_QUEUE_MAX_PENDING);

		process.env.OPENUI_QUEUE_MAX_PENDING = "not-a-number";
		expect(getOpenuiQueueMaxPending()).toBe(DEFAULT_OPENUI_QUEUE_MAX_PENDING);
	});

	it("accepts valid queue max pending and sidecar buffer overrides", async () => {
		const {
			DEFAULT_OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES,
			getGeminiSidecarStdoutBufferMaxBytes,
			getOpenuiQueueMaxPending,
		} = await loadConstantsModule();

		process.env.OPENUI_QUEUE_MAX_PENDING = "64";
		expect(getOpenuiQueueMaxPending()).toBe(64);

		process.env.OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES = "65536";
		expect(getGeminiSidecarStdoutBufferMaxBytes()).toBe(65536);

		process.env.OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES = "0";
		expect(getGeminiSidecarStdoutBufferMaxBytes()).toBe(
			DEFAULT_OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES,
		);
	});

	it("uses default sidecar stdout buffer when env is empty", async () => {
		const {
			DEFAULT_OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES,
			getGeminiSidecarStdoutBufferMaxBytes,
		} = await loadConstantsModule();

		delete process.env.OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES;
		expect(getGeminiSidecarStdoutBufferMaxBytes()).toBe(
			DEFAULT_OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES,
		);
	});

	it("supports default log rotate and rejects invalid rotate mode", async () => {
		const { getOpenuiMcpLogRotateOnStart } = await loadConstantsModule();

		delete process.env.OPENUI_MCP_LOG_ROTATE_ON_START;
		expect(getOpenuiMcpLogRotateOnStart()).toBe("on");

		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "invalid";
		expect(() => getOpenuiMcpLogRotateOnStart()).toThrow(
			'OPENUI_MCP_LOG_ROTATE_ON_START must be "on" or "off"',
		);
	});

	it("rejects workspace root that does not exist or is not a directory", async () => {
		const missingPath = path.join(
			os.tmpdir(),
			`openui-missing-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		);
		process.env.OPENUI_MCP_WORKSPACE_ROOT = missingPath;
		const moduleForMissing = await loadConstantsModule();
		expect(() => moduleForMissing.getWorkspaceRoot()).toThrow(
			"must point to an existing directory",
		);

		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-file-root-"),
		);
		tempDirs.push(tempDir);
		const tempFile = path.join(tempDir, "root-file.txt");
		await fs.writeFile(tempFile, "not a dir", "utf8");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = tempFile;
		const moduleForFile = await loadConstantsModule();
		expect(() => moduleForFile.getWorkspaceRoot()).toThrow(
			"must point to a directory",
		);
	});

	it("keeps runtime logs governed and rejects cache dirs outside workspace root", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-workspace-root-"),
		);
		tempDirs.push(workspaceRoot);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-outside-root-"),
		);
		tempDirs.push(outsideRoot);

		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = "constants-run";
		process.env.OPENUI_MCP_LOG_DIR = path.join(outsideRoot, "logs");
		process.env.OPENUI_MCP_CACHE_DIR = path.join(outsideRoot, "cache");

		const constants = await loadConstantsModule();
		const canonicalWorkspaceRoot = await fs.realpath(workspaceRoot);
		expect(constants.getOpenuiMcpLogDirWithinWorkspace()).toBe(
			path.join(
				canonicalWorkspaceRoot,
				".runtime-cache",
				"runs",
				"constants-run",
				"logs",
			),
		);
		expect(() => constants.getOpenuiMcpCacheDirWithinWorkspace()).toThrow(
			/OPENUI_MCP_CACHE_DIR must resolve inside OPENUI_MCP_WORKSPACE_ROOT/,
		);
	});

	it("resolves default runtime log/cache dirs under workspace root", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-runtime-root-"),
		);
		tempDirs.push(workspaceRoot);

		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = "constants-default-run";
		delete process.env.OPENUI_MCP_LOG_DIR;
		delete process.env.OPENUI_MCP_CACHE_DIR;

		const constants = await loadConstantsModule();
		const canonicalWorkspaceRoot = await fs.realpath(workspaceRoot);
		expect(constants.getOpenuiMcpLogDirWithinWorkspace()).toBe(
			path.join(
				canonicalWorkspaceRoot,
				".runtime-cache",
				"runs",
				"constants-default-run",
				"logs",
			),
		);
		expect(constants.getOpenuiMcpCacheDirWithinWorkspace()).toBe(
			path.join(canonicalWorkspaceRoot, ".runtime-cache/cache"),
		);
	});
});
