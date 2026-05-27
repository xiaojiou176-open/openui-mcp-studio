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
	"SHADCN_BRIEF_LOG_LEVEL",
	"SHADCN_BRIEF_LOG_OUTPUT",
	"SHADCN_BRIEF_LOG_ROTATE_ON_START",
	"SHADCN_BRIEF_LOG_RETENTION_DAYS",
	"SHADCN_BRIEF_LOG_MAX_FILE_MB",
	"SHADCN_BRIEF_WORKSPACE_ROOT",
	"OPENUI_RUNTIME_RUN_ID",
	"SHADCN_BRIEF_CACHE_DIR",
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
		const logDir = mkTempDir("shadcn-brief-logger-suffix-");
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
		const workspaceRoot = mkTempDir("shadcn-brief-logger-non-error-");
		process.env.SHADCN_BRIEF_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = "logger-low-core-run";
		process.env.SHADCN_BRIEF_CACHE_DIR = mkTempDir("shadcn-brief-cache-dir-");
		process.env.SHADCN_BRIEF_LOG_LEVEL = "debug";
		process.env.SHADCN_BRIEF_LOG_OUTPUT = "file";
		process.env.SHADCN_BRIEF_LOG_MAX_FILE_MB = "10";
		process.env.SHADCN_BRIEF_LOG_RETENTION_DAYS = "7";
		process.env.SHADCN_BRIEF_LOG_ROTATE_ON_START = "off";

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
