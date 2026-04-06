import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	buildMissingKeyMessage,
	resolveGeminiApiKey,
	runLiveGeminiSmoke,
} from "../tooling/run-live-tests.mjs";

const tempDirs: string[] = [];

function makeTempDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openui-live-env-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	vi.restoreAllMocks();

	for (const dir of tempDirs.splice(0, tempDirs.length)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("live gemini env resolution", () => {
	it("reads GEMINI_API_KEY from .env when process.env is empty", () => {
		const cwd = makeTempDir();
		fs.writeFileSync(
			path.join(cwd, ".env"),
			"GEMINI_API_KEY=from-dot-env\n",
			"utf8",
		);

		const resolved = resolveGeminiApiKey({
			env: {} as NodeJS.ProcessEnv,
			cwd,
			run: vi.fn(),
		});

		expect(resolved.source).toBe("env-file");
		expect(resolved.key).toBe("from-dot-env");
	});

	it("ignores .env.local for live key resolution and falls back to zsh", () => {
		const cwd = makeTempDir();
		fs.writeFileSync(
			path.join(cwd, ".env.local"),
			"GEMINI_API_KEY=from-dot-env-local\n",
			"utf8",
		);
		const run = vi.fn().mockReturnValueOnce({
			status: 0,
			stdout: "from-zsh\n",
			stderr: "",
			error: undefined,
		});

		const resolved = resolveGeminiApiKey({
			env: {} as NodeJS.ProcessEnv,
			cwd,
			run,
		});

		expect(resolved.source).toBe("zsh-login-shell");
		expect(resolved.key).toBe("from-zsh");
	});

	it("falls back to zsh login env when .env files do not contain key", () => {
		const cwd = makeTempDir();
		const run = vi.fn().mockReturnValueOnce({
			status: 0,
			stdout: "from-zsh\n",
			stderr: "",
			error: undefined,
		});

		const resolved = resolveGeminiApiKey({
			env: {} as NodeJS.ProcessEnv,
			cwd,
			run,
		});

		expect(resolved.source).toBe("zsh-login-shell");
		expect(resolved.key).toBe("from-zsh");
		expect(run).toHaveBeenCalledWith(
			"zsh",
			["-lic", "printenv GEMINI_API_KEY"],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
	});

	it("throws explicit failure semantics when no key can be resolved", () => {
		const cwd = makeTempDir();
		const env = {} as NodeJS.ProcessEnv;
		const run = vi
			.fn()
			.mockReturnValue({ status: 1, stdout: "", stderr: "", error: undefined });

		expect(() => runLiveGeminiSmoke({ env, cwd, run })).toThrowError(
			buildMissingKeyMessage(),
		);
		expect(env.GEMINI_API_KEY).toBeUndefined();
		expect(env.OPENUI_ENABLE_LIVE_GEMINI_SMOKE).toBeUndefined();
	});
});
