import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getNoFollowWriteFlagOrThrow,
	isNoFollowWriteProtectionSupported,
} from "../services/mcp-server/src/file-ops.js";
import {
	isPathInsideRoot,
	isPathInsideRootWithRealpath,
	isProtectedWorkspacePath,
	normalizePath,
} from "../packages/shared-runtime/src/path-utils.js";

describe("path utils", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("normalizes backslashes and leading ./ prefix", () => {
		expect(normalizePath(".\\src\\app\\page.tsx")).toBe("src/app/page.tsx");
	});

	it("throws when path contains null bytes", () => {
		expect(() => normalizePath("src/\0app.tsx")).toThrow(
			"Null bytes in paths are not allowed.",
		);
	});

	it("matches protected workspace paths by any configured pattern", () => {
		expect(isProtectedWorkspacePath("node_modules/react/index.js")).toBe(true);
		expect(isProtectedWorkspacePath(".env.local")).toBe(true);
		expect(isProtectedWorkspacePath(".git/config")).toBe(true);
		expect(isProtectedWorkspacePath("/.env")).toBe(true);
		expect(isProtectedWorkspacePath("src/app/page.tsx")).toBe(false);
	});

	it("accepts descendants inside root and rejects traversal outside root", () => {
		const root = "/repo/workspace";
		expect(isPathInsideRoot(root, "/repo/workspace/src/app.tsx")).toBe(true);
		expect(isPathInsideRoot(root, "/repo/workspace")).toBe(true);
		expect(isPathInsideRoot(root, "/repo/other/file.ts")).toBe(false);
	});

	it("rejects symlink-based escapes with realpath-aware check", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "openui-path-root-"));
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), "openui-path-out-"));
		try {
			fs.mkdirSync(path.join(root, "safe"), { recursive: true });
			fs.symlinkSync(outside, path.join(root, "safe", "jump"));
			const escaped = path.join(root, "safe", "jump", "payload.txt");

			expect(isPathInsideRoot(root, escaped)).toBe(true);
			expect(isPathInsideRootWithRealpath(root, escaped)).toBe(false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	it("falls back safely when realpath lookup cannot resolve any ancestor", () => {
		const spy = vi.spyOn(fs, "realpathSync").mockImplementation(() => {
			throw new Error("mock-realpath-failure");
		});

		try {
			expect(
				isPathInsideRootWithRealpath(
					"/repo/workspace",
					"/repo/workspace/src/app/page.tsx",
				),
			).toBe(true);
			expect(
				isPathInsideRootWithRealpath(
					"/repo/workspace",
					"/repo/other/escape.ts",
				),
			).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});

	it("accepts no-follow write protection on linux and darwin when flag exists", () => {
		expect(
			isNoFollowWriteProtectionSupported({
				platform: "linux",
				oNoFollow: 256,
			}),
		).toBe(true);
		expect(
			isNoFollowWriteProtectionSupported({
				platform: "darwin",
				oNoFollow: 256,
			}),
		).toBe(true);
	});

	it("rejects no-follow write protection on win32 or when flag is invalid", () => {
		expect(
			isNoFollowWriteProtectionSupported({
				platform: "win32",
				oNoFollow: 256,
			}),
		).toBe(false);
		expect(
			isNoFollowWriteProtectionSupported({
				platform: "linux",
				oNoFollow: 0,
			}),
		).toBe(false);
		expect(
			isNoFollowWriteProtectionSupported({
				platform: "linux",
				oNoFollow: -1,
			}),
		).toBe(false);
	});

	it("fails closed with explicit error when no-follow write protection is unsupported", () => {
		expect(() =>
			getNoFollowWriteFlagOrThrow({
				platform: "win32",
				oNoFollow: 256,
			}),
		).toThrow(/unsupported on platform win32/i);
	});
});
