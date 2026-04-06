import { afterEach, describe, expect, it, vi } from "vitest";

const MODEL_ENV_KEYS = [
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"OPENUI_MODEL_ROUTING",
] as const;

const originalEnv = new Map<string, string | undefined>(
	MODEL_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnv(): void {
	for (const key of MODEL_ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

function setRoutingEnabled(enabled: boolean): void {
	process.env.OPENUI_MODEL_ROUTING = enabled ? "on" : "off";
}

function setBaseEnv(): void {
	process.env.GEMINI_MODEL = "gemini-default";
	process.env.GEMINI_MODEL_FAST = "gemini-fast";
	process.env.GEMINI_MODEL_STRONG = "gemini-strong";
	setRoutingEnabled(true);
}

afterEach(() => {
	restoreEnv();
	vi.resetModules();
});

describe("model routing", () => {
	it("routing off ignores route key and stays on GEMINI_MODEL", async () => {
		setBaseEnv();
		setRoutingEnabled(false);

		const { resolveOpenuiModel } = await import(
			"../services/mcp-server/src/constants.js"
		);

		expect(resolveOpenuiModel({ routeKey: "fast" }).resolvedModel).toBe(
			"gemini-default",
		);
		expect(resolveOpenuiModel({ routeKey: "strong" }).resolvedModel).toBe(
			"gemini-default",
		);
	});

	it("routing on uses fast/strong route models", async () => {
		setBaseEnv();
		setRoutingEnabled(true);

		const { resolveOpenuiModel } = await import(
			"../services/mcp-server/src/constants.js"
		);

		expect(resolveOpenuiModel({ routeKey: "fast" }).resolvedModel).toBe(
			"gemini-fast",
		);
		expect(resolveOpenuiModel({ routeKey: "strong" }).resolvedModel).toBe(
			"gemini-strong",
		);
	});

	it("useFast=true routes to fast model even without routeKey", async () => {
		setBaseEnv();
		setRoutingEnabled(true);

		const { resolveOpenuiModel } = await import(
			"../services/mcp-server/src/constants.js"
		);

		expect(resolveOpenuiModel({ useFast: true }).resolvedModel).toBe(
			"gemini-fast",
		);
	});

	it("explicit model overrides route selection", async () => {
		setBaseEnv();

		const { resolveOpenuiModel } = await import(
			"../services/mcp-server/src/constants.js"
		);

		const resolution = resolveOpenuiModel({
			routeKey: "strong",
			explicitModel: "gemini-explicit",
		});

		expect(resolution.resolvedModel).toBe("gemini-explicit");
		expect(resolution.source).toBe("explicit");
	});
});
