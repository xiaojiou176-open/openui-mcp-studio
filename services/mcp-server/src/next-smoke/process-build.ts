import { spawn } from "node:child_process";
import { buildChildEnvFromAllowlist } from "../../../../packages/shared-runtime/src/child-env.js";
import { type LogTailBuffer, normalizeReason } from "./logging.js";
import {
	terminateChildProcess,
	waitForExitWithTimeout,
} from "./process-exit.js";
import type { NextSmokeCommand, NextSmokeStepResult } from "./types.js";

export async function runBuildStep(input: {
	cwd: string;
	timeoutMs: number;
	logs: LogTailBuffer;
	command: NextSmokeCommand;
}): Promise<NextSmokeStepResult> {
	const startedAt = Date.now();
	const command = input.command.command;
	const childEnv = buildChildEnvFromAllowlist();

	try {
		const child = spawn(input.command.executable, input.command.args, {
			cwd: input.cwd,
			env: childEnv,
			stdio: ["ignore", "pipe", "pipe"],
		});

		child.stdout?.on("data", (chunk: Buffer | string) => {
			input.logs.append("build:stdout", chunk.toString());
		});

		child.stderr?.on("data", (chunk: Buffer | string) => {
			input.logs.append("build:stderr", chunk.toString());
		});

		let spawnError: string | null = null;
		child.once("error", (error) => {
			spawnError = normalizeReason(error);
			input.logs.append("build:error", spawnError);
		});

		const timeoutTimer = setTimeout(() => {
			void terminateChildProcess(child);
		}, input.timeoutMs);

		const exit = await waitForExitWithTimeout(child, input.timeoutMs + 2_000);
		clearTimeout(timeoutTimer);

		const durationMs = Date.now() - startedAt;
		if (spawnError) {
			return {
				ok: false,
				command,
				exitCode: 1,
				timedOut: false,
				durationMs,
				detail: `Build failed before execution: ${spawnError}`,
			};
		}

		if (!exit.exited) {
			return {
				ok: false,
				command,
				exitCode: child.exitCode,
				timedOut: true,
				durationMs,
				detail: `Build timed out after ${input.timeoutMs}ms.`,
			};
		}

		if (exit.code !== 0) {
			return {
				ok: false,
				command,
				exitCode: exit.code,
				timedOut: false,
				durationMs,
				detail: `Build exited with code ${String(exit.code)}.`,
			};
		}

		return {
			ok: true,
			command,
			exitCode: exit.code,
			timedOut: false,
			durationMs,
			detail: "Build completed successfully.",
		};
	} catch (error) {
		return {
			ok: false,
			command,
			exitCode: 1,
			timedOut: false,
			durationMs: Date.now() - startedAt,
			detail: `Build execution failed: ${normalizeReason(error)}`,
		};
	}
}
