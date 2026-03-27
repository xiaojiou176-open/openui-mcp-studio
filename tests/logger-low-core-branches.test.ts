import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__test__,
	isNoFollowAppendProtectionSupported,
	logInfo,
} from "../services/mcp-server/src/logger.js";

const ENV_KEYS = [
	"OPENUI_MCP_LOG_LEVEL",
	"OPENUI_MCP_LOG_OUTPUT",
	"OPENUI_MCP_LOG_ROTATE_ON_START",
	"OPENUI_MCP_LOG_RETENTION_DAYS",
	"OPENUI_MCP_LOG_MAX_FILE_MB",
	"OPENUI_MCP_WORKSPACE_ROOT",
	"OPENUI_RUNTIME_RUN_ID",
	"OPENUI_MCP_CACHE_DIR",
] as const;
const originalEnv = new Map<string, string | undefined>(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);
const tempDirs: string[] = [];

function restoreEnv(): void {
	for (const [key, value] of originalEnv) {
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
}

function mkTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	restoreEnv();
	vi.restoreAllMocks();
	vi.resetModules();
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("logger low-core branches", () => {
	it("supports implicit platform constants path for no-follow check", () => {
		const result = isNoFollowAppendProtectionSupported();
		expect(typeof result).toBe("boolean");
	});

	it("skips entries with matching prefix but non-jsonl suffix during prune", () => {
		const logDir = mkTempDir("openui-logger-suffix-");
		const activeFilePath = path.join(logDir, "runtime.jsonl");
		const wrongSuffix = path.join(
			logDir,
			"runtime.2020-01-01T00-00-00-000Z.tmp",
		);
		const validRotated = path.join(
			logDir,
			"runtime.2020-01-01T00-00-00-000Z.jsonl",
		);
		fs.writeFileSync(activeFilePath, "active", "utf8");
		fs.writeFileSync(wrongSuffix, "keep", "utf8");
		fs.writeFileSync(validRotated, "old", "utf8");
		const oldDate = new Date("2000-01-01T00:00:00.000Z");
		fs.utimesSync(validRotated, oldDate, oldDate);

		__test__.pruneExpiredLogFiles({
			activeFilePath,
			currentBytes: 0,
			disabled: false,
			logDir,
			maxBytes: 1024,
			retentionDays: 1,
			rotateOnStart: false,
		});

		expect(fs.existsSync(wrongSuffix)).toBe(true);
		expect(fs.existsSync(validRotated)).toBe(false);
	});

	it("logs internal error payload when initialization fails with non-Error input", async () => {
		const workspaceRoot = mkTempDir("openui-logger-non-error-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = "logger-low-core-run";
		process.env.OPENUI_MCP_CACHE_DIR = mkTempDir("openui-cache-dir-");
		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "off";

		const mkdirSpy = vi.spyOn(fs, "mkdirSync").mockImplementationOnce(() => {
			throw "mkdir-failed";
		});
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logInfo("should-fallback-to-stderr-on-init-failure");

		expect(mkdirSpy).toHaveBeenCalled();
		const payloads = stderrSpy.mock.calls
			.map(
				([line]) =>
					JSON.parse(String(line)) as { context?: string; error?: string },
			)
			.filter((item) => item.context === "initialize_file_sink");
		expect(payloads).toHaveLength(1);
		expect(payloads[0]?.error).toBe("mkdir-failed");
	});
});
