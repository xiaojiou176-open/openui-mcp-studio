import { describe, expect, it } from "vitest";

import {
	buildChildEnvFromAllowlist,
	OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST,
	parseChildEnvAllowlist,
} from "../packages/shared-runtime/src/child-env.js";

describe("child-env branch coverage", () => {
	it("parses empty custom allowlist safely", () => {
		const parsed = parseChildEnvAllowlist(undefined);

		expect(parsed).toEqual([...OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST]);
	});

	it("always preserves base allowlist when custom allowlist is provided", () => {
		const parsed = parseChildEnvAllowlist("OPENUI_MCP_CHILD_ENV_ALLOWLIST");
		expect(parsed).toContain("PATH");
		expect(parsed).toContain("OPENUI_MCP_CHILD_ENV_ALLOWLIST");
	});

	it("skips empty tokens and deduplicates entries", () => {
		const parsed = parseChildEnvAllowlist(
			" OPENUI_*, , GEMINI_API_KEY,OPENUI_*,GEMINI_API_KEY, ",
		);

		expect(parsed).toContain("OPENUI_*");
		expect(parsed).toContain("GEMINI_API_KEY");
		expect(parsed.filter((token) => token === "OPENUI_*")).toHaveLength(1);
		expect(parsed.filter((token) => token === "GEMINI_API_KEY")).toHaveLength(
			1,
		);
	});

	it("deduplicates tokens that overlap with base allowlist entries", () => {
		const parsed = parseChildEnvAllowlist("PATH,PATH");
		expect(parsed.filter((token) => token === "PATH")).toHaveLength(1);
	});

	it("rejects malformed custom tokens", () => {
		expect(() => parseChildEnvAllowlist("openui-*")).toThrow(/invalid token/i);
	});

	it("handles exact and wildcard tokens and skips undefined values", () => {
		const sourceEnv: NodeJS.ProcessEnv = {
			EXACT_ONLY: "exact-hit",
			PREFIX_ENTRY: "wildcard-hit",
			PREFIX_OTHER: "wildcard-hit-2",
			GEMINI_MODEL: "gemini-3-flash-preview",
			GEMINI_API_KEY: "AIza-sensitive",
			MISSING_VALUE: undefined,
			UNLISTED_SECRET: "blocked",
		};

		const childEnv = buildChildEnvFromAllowlist(
			sourceEnv,
			"EXACT_ONLY,PREFIX_*,GEMINI_*,MISSING_VALUE",
		);

		expect(childEnv.EXACT_ONLY).toBe("exact-hit");
		expect(childEnv.PREFIX_ENTRY).toBe("wildcard-hit");
		expect(childEnv.PREFIX_OTHER).toBe("wildcard-hit-2");
		expect(childEnv.GEMINI_MODEL).toBe("gemini-3-flash-preview");
		expect(childEnv.GEMINI_API_KEY).toBeUndefined();
		expect(childEnv.MISSING_VALUE).toBeUndefined();
		expect(childEnv.UNLISTED_SECRET).toBeUndefined();
	});

	it("drops NO_COLOR when FORCE_COLOR is also present", () => {
		const childEnv = buildChildEnvFromAllowlist(
			{
				NO_COLOR: "1",
				FORCE_COLOR: "1",
			},
			"NO_COLOR,FORCE_COLOR",
		);

		expect(childEnv.FORCE_COLOR).toBe("1");
		expect(childEnv.NO_COLOR).toBeUndefined();
	});

	it("supports Windows mixed-case env keys for base allowlist entries", () => {
		const childEnv = buildChildEnvFromAllowlist(
			{
				Path: "C:\\Windows\\System32",
				ComSpec: "C:\\Windows\\System32\\cmd.exe",
				SystemRoot: "C:\\Windows",
			},
			undefined,
			{ caseInsensitiveKeys: true },
		);

		expect(childEnv.Path).toBe("C:\\Windows\\System32");
		expect(childEnv.ComSpec).toBe("C:\\Windows\\System32\\cmd.exe");
		expect(childEnv.SystemRoot).toBe("C:\\Windows");
	});

	it("preserves PLAYWRIGHT_BROWSERS_PATH from the base allowlist", () => {
		const childEnv = buildChildEnvFromAllowlist({
			PLAYWRIGHT_BROWSERS_PATH: "/workspace/.runtime-cache/ms-playwright",
		});

		expect(childEnv.PLAYWRIGHT_BROWSERS_PATH).toBe(
			"/workspace/.runtime-cache/ms-playwright",
		);
	});

	it("preserves OPENUI_CI_GATE_RUN_KEY from the base allowlist", () => {
		const childEnv = buildChildEnvFromAllowlist({
			OPENUI_CI_GATE_RUN_KEY: "ci-gate-run-123",
		});

		expect(childEnv.OPENUI_CI_GATE_RUN_KEY).toBe("ci-gate-run-123");
	});

	it("applies sensitive denylist case-insensitively when enabled", () => {
		const childEnv = buildChildEnvFromAllowlist(
			{
				Gemini_Api_Key: "secret",
			},
			"GEMINI_*",
			{ caseInsensitiveKeys: true },
		);

		expect(childEnv.Gemini_Api_Key).toBeUndefined();
	});

	it("keeps wildcard allowlist but still strips sensitive key patterns", () => {
		const childEnv = buildChildEnvFromAllowlist(
			{
				OPENUI_THEME: "ocean",
				OPENUI_SERVICE_TOKEN: "token-secret",
				OPENUI_BACKEND_API_KEY: "api-key-secret",
				OPENUI_SIGNING_SECRET: "signing-secret",
				OPENUI_ADMIN_PASSWORD: "password-secret",
			},
			"OPENUI_*",
		);

		expect(childEnv.OPENUI_THEME).toBe("ocean");
		expect(childEnv.OPENUI_SERVICE_TOKEN).toBeUndefined();
		expect(childEnv.OPENUI_BACKEND_API_KEY).toBeUndefined();
		expect(childEnv.OPENUI_SIGNING_SECRET).toBeUndefined();
		expect(childEnv.OPENUI_ADMIN_PASSWORD).toBeUndefined();
	});
});
