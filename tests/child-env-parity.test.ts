import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
	buildChildEnvFromAllowlist as buildFromSrc,
	parseChildEnvAllowlist as parseFromSrc,
	OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST as srcBaseAllowlist,
} from "../packages/shared-runtime/src/child-env.js";

async function loadScriptChildEnvModule(): Promise<{
	OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST: readonly string[];
	parseChildEnvAllowlist: (raw: string | undefined) => string[];
	buildChildEnvFromAllowlist: (
		sourceEnv?: NodeJS.ProcessEnv,
		allowlistRaw?: string | undefined,
		options?: { caseInsensitiveKeys?: boolean },
	) => NodeJS.ProcessEnv;
}> {
	const modulePath = path.resolve(
		process.cwd(),
		"tooling/shared/child-env.mjs",
	);
	return import(pathToFileURL(modulePath).href);
}

describe("child-env parity between src and scripts", () => {
	it("keeps base allowlist in sync", async () => {
		const script = await loadScriptChildEnvModule();
		expect(script.OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST).toEqual(
			srcBaseAllowlist,
		);
		expect(script.OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST).toContain("COMSPEC");
		expect(script.OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST).toContain("SYSTEMROOT");
	});

	it("keeps parser behavior in sync", async () => {
		const script = await loadScriptChildEnvModule();
		const raw = " OPENUI_*, GEMINI_*, PATH, OPENUI_* ";
		expect(script.parseChildEnvAllowlist(raw)).toEqual(parseFromSrc(raw));
	});

	it("keeps denylist and case-insensitive behavior in sync", async () => {
		const script = await loadScriptChildEnvModule();
		const sourceEnv: NodeJS.ProcessEnv = {
			Path: "C:\\Windows\\System32",
			ComSpec: "C:\\Windows\\System32\\cmd.exe",
			SystemRoot: "C:\\Windows",
			OPENUI_THEME: "ocean",
			OPENUI_SERVICE_TOKEN: "redacted",
			Gemini_Api_Key: "redacted",
		};
		const allowlist = "OPENUI_*,GEMINI_*,PATH,COMSPEC,SYSTEMROOT";
		const options = { caseInsensitiveKeys: true };

		const srcResult = buildFromSrc(sourceEnv, allowlist, options);
		const scriptResult = script.buildChildEnvFromAllowlist(
			sourceEnv,
			allowlist,
			options,
		);
		expect(scriptResult).toEqual(srcResult);
		expect(scriptResult.OPENUI_THEME).toBe("ocean");
		expect(scriptResult.OPENUI_SERVICE_TOKEN).toBeUndefined();
		expect(scriptResult.Gemini_Api_Key).toBeUndefined();
	});
});
