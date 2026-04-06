import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { __test__ } from "../services/mcp-server/src/logger.js";

const tempDirs: string[] = [];

function mkTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("logger internals", () => {
	it("increments rotated suffixes when timestamped file names collide", () => {
		const logDir = mkTempDir("openui-logger-internals-");
		const first = __test__.buildRotatedLogFilePath(logDir);
		fs.writeFileSync(first, "existing", "utf8");
		const second = __test__.buildRotatedLogFilePath(logDir);
		expect(second).not.toBe(first);
		expect(fs.existsSync(second)).toBe(false);
		expect(path.basename(second)).toMatch(/^runtime\..+\.jsonl$/);
	});

	it("resets current bytes when rotating a missing active file", () => {
		const logDir = mkTempDir("openui-logger-missing-");
		const state = {
			activeFilePath: path.join(logDir, "runtime.jsonl"),
			currentBytes: 42,
			disabled: false,
			logDir,
			maxBytes: 1024,
			retentionDays: 7,
			rotateOnStart: false,
		};
		__test__.rotateActiveLogFile(state);
		expect(state.currentBytes).toBe(0);
	});

	it("prunes expired log files and skips active/missing/non-file entries", () => {
		const logDir = mkTempDir("openui-logger-prune-");
		const activeFilePath = path.join(logDir, "runtime.jsonl");
		const expiredFile = path.join(
			logDir,
			"runtime.2000-01-01T00-00-00-000Z.jsonl",
		);
		const freshFile = path.join(
			logDir,
			"runtime.2999-01-01T00-00-00-000Z.jsonl",
		);
		const folderEntry = path.join(logDir, "runtime.folder.jsonl");
		fs.writeFileSync(activeFilePath, "active", "utf8");
		fs.writeFileSync(expiredFile, "old", "utf8");
		fs.writeFileSync(freshFile, "fresh", "utf8");
		fs.mkdirSync(folderEntry);
		const oldDate = new Date("2000-01-01T00:00:00.000Z");
		const futureDate = new Date("2999-01-01T00:00:00.000Z");
		fs.utimesSync(expiredFile, oldDate, oldDate);
		fs.utimesSync(freshFile, futureDate, futureDate);

		const state = {
			activeFilePath,
			currentBytes: 0,
			disabled: false,
			logDir,
			maxBytes: 1024,
			retentionDays: 7,
			rotateOnStart: false,
		};
		__test__.pruneExpiredLogFiles(state);
		expect(fs.existsSync(expiredFile)).toBe(false);
		expect(fs.existsSync(freshFile)).toBe(true);
		expect(fs.existsSync(activeFilePath)).toBe(true);
		expect(fs.existsSync(folderEntry)).toBe(true);
	});
});
