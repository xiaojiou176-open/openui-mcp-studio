import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { buildChildEnvFromAllowlist } from "../../../../packages/shared-runtime/src/child-env.js";
import { type LogTailBuffer, normalizeReason } from "./logging.js";
import { getNpmCommand } from "./process-command.js";
import {
	terminateChildProcess,
	waitForExitWithTimeout,
} from "./process-exit.js";

export async function ensureDependenciesInstalled(input: {
	cwd: string;
	logs: LogTailBuffer;
	timeoutMs: number;
	requiredPackages: readonly string[];
}): Promise<{ ok: boolean; detail: string }> {
	const requireFromRoot = createRequire(path.resolve(input.cwd, "package.json"));
	const missingPackages = input.requiredPackages.filter((packageName) => {
		try {
			requireFromRoot.resolve(`${packageName}/package.json`);
			return false;
		} catch {
			return true;
		}
	});

	if (missingPackages.length === 0) {
		return {
			ok: true,
			detail: "Required Next runtime dependencies are already installed.",
		};
	}

	const command = `${getNpmCommand()} install --no-audit --no-fund`;
	input.logs.append(
		"prepare",
		`Installing dependencies (${missingPackages.join(", ")}): ${command}`,
	);
	const startedAt = Date.now();
	const childEnv = buildChildEnvFromAllowlist();

	try {
		const child = spawn(
			getNpmCommand(),
			["install", "--no-audit", "--no-fund"],
			{
				cwd: input.cwd,
				env: childEnv,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		child.stdout?.on("data", (chunk: Buffer | string) => {
			input.logs.append("prepare:stdout", chunk.toString());
		});

		child.stderr?.on("data", (chunk: Buffer | string) => {
			input.logs.append("prepare:stderr", chunk.toString());
		});

		let spawnError: string | null = null;
		child.once("error", (error) => {
			spawnError = normalizeReason(error);
			input.logs.append("prepare:error", spawnError);
		});

		const timeoutTimer = setTimeout(() => {
			void terminateChildProcess(child);
		}, input.timeoutMs);
		const exit = await waitForExitWithTimeout(child, input.timeoutMs + 2_000);
		clearTimeout(timeoutTimer);

		if (spawnError) {
			return {
				ok: false,
				detail: `Dependency install failed before execution: ${spawnError}`,
			};
		}

		if (!exit.exited) {
			return {
				ok: false,
				detail: `Dependency install timed out after ${input.timeoutMs}ms.`,
			};
		}

		if (exit.code !== 0) {
			return {
				ok: false,
				detail: `Dependency install exited with code ${String(exit.code)}.`,
			};
		}

		const durationMs = Date.now() - startedAt;
		return {
			ok: true,
			detail: `Dependencies installed in ${durationMs}ms.`,
		};
	} catch (error) {
		return {
			ok: false,
			detail: `Dependency install failed: ${normalizeReason(error)}`,
		};
	}
}
