import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
	"OPENUI_MCP_WORKSPACE_ROOT",
	"OPENUI_MCP_LOG_OUTPUT",
	"OPENUI_MCP_LOG_DIR",
	"OPENUI_MCP_CACHE_DIR",
	"OPENUI_MCP_LOG_ROTATE_ON_START",
	"OPENUI_RUNTIME_RUN_ID",
] as const;

const originalEnv = new Map<string, string | undefined>(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnv(): void {
	for (const key of ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

afterEach(() => {
	restoreEnv();
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("constants log/cache path branches", () => {
	it("validates log output enum and defaults", async () => {
		const constants = await import("../services/mcp-server/src/constants.js");

		delete process.env.OPENUI_MCP_LOG_OUTPUT;
		expect(constants.getOpenuiMcpLogOutput()).toBe("both");

		process.env.OPENUI_MCP_LOG_OUTPUT = "both";
		expect(constants.getOpenuiMcpLogOutput()).toBe("both");

		process.env.OPENUI_MCP_LOG_OUTPUT = "stdout";
		expect(() => constants.getOpenuiMcpLogOutput()).toThrow(
			/OPENUI_MCP_LOG_OUTPUT must be one of/,
		);
	});

	it("resolves log and cache directories from workspace-relative and absolute values", async () => {
		const workspaceRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "openui-constants-"),
		);
		const canonicalWorkspaceRoot = fs.realpathSync(workspaceRoot);
		const absoluteLogDir = path.join(os.tmpdir(), "openui-absolute-log-dir");
		const absoluteCacheDir = path.join(
			os.tmpdir(),
			"openui-absolute-cache-dir",
		);
		fs.mkdirSync(workspaceRoot, { recursive: true });
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = "constants-log-paths";

		const constants = await import("../services/mcp-server/src/constants.js");

		delete process.env.OPENUI_MCP_LOG_DIR;
		delete process.env.OPENUI_MCP_CACHE_DIR;
		expect(constants.getOpenuiMcpLogDir()).toBe(
			path.resolve(
				canonicalWorkspaceRoot,
				".runtime-cache",
				"runs",
				"constants-log-paths",
				"logs",
			),
		);
		expect(constants.getOpenuiMcpCacheDir()).toBe(
			path.resolve(canonicalWorkspaceRoot, ".runtime-cache/cache"),
		);

		process.env.OPENUI_MCP_LOG_DIR = ".runtime-cache/logs/custom";
		process.env.OPENUI_MCP_CACHE_DIR = "cache/custom";
		expect(constants.getOpenuiMcpLogDir()).toBe(
			path.resolve(
				canonicalWorkspaceRoot,
				".runtime-cache",
				"runs",
				"constants-log-paths",
				"logs",
			),
		);
		expect(constants.getOpenuiMcpCacheDir()).toBe(
			path.resolve(canonicalWorkspaceRoot, "cache/custom"),
		);

		process.env.OPENUI_MCP_LOG_DIR = absoluteLogDir;
		process.env.OPENUI_MCP_CACHE_DIR = absoluteCacheDir;
		expect(constants.getOpenuiMcpLogDir()).toBe(
			path.resolve(
				canonicalWorkspaceRoot,
				".runtime-cache",
				"runs",
				"constants-log-paths",
				"logs",
			),
		);
		expect(constants.getOpenuiMcpCacheDir()).toBe(
			path.resolve(absoluteCacheDir),
		);
	});
});
