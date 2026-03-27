import { spawn } from "node:child_process";
import { buildChildEnvFromAllowlist } from "../../../../packages/shared-runtime/src/child-env.js";
import { type LogTailBuffer, normalizeReason } from "./logging.js";
import type { ChildProcessHandle } from "./process-exit.js";
import type { NextSmokeCommand, NextSmokeStartResult } from "./types.js";

export async function startServerStep(input: {
	cwd: string;
	startupGraceMs: number;
	port: number;
	logs: LogTailBuffer;
	command: NextSmokeCommand;
}): Promise<{
	step: NextSmokeStartResult;
	child: ChildProcessHandle | null;
}> {
	const startedAt = Date.now();
	const command = input.command.command;
	const childEnv = buildChildEnvFromAllowlist();

	try {
		const child = spawn(input.command.executable, input.command.args, {
			cwd: input.cwd,
			env: {
				...childEnv,
				PORT: String(input.port),
			},
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});

		child.stdout?.on("data", (chunk: Buffer | string) => {
			input.logs.append("start:stdout", chunk.toString());
		});

		child.stderr?.on("data", (chunk: Buffer | string) => {
			input.logs.append("start:stderr", chunk.toString());
		});

		const firstSignal = await new Promise<
			| { type: "ready" }
			| { type: "exit"; code: number | null; signal: NodeJS.Signals | null }
			| { type: "error"; message: string }
		>((resolve) => {
			const timer = setTimeout(() => {
				child.off("exit", onExit);
				child.off("error", onError);
				resolve({ type: "ready" });
			}, input.startupGraceMs);

			const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
				clearTimeout(timer);
				child.off("error", onError);
				resolve({
					type: "exit",
					code,
					signal,
				});
			};

			const onError = (error: Error) => {
				clearTimeout(timer);
				child.off("exit", onExit);
				resolve({
					type: "error",
					message: normalizeReason(error),
				});
			};

			child.once("exit", onExit);
			child.once("error", onError);
		});

		const durationMs = Date.now() - startedAt;
		if (firstSignal.type === "error") {
			return {
				step: {
					ok: false,
					command,
					exitCode: 1,
					timedOut: false,
					durationMs,
					detail: `Start process failed to spawn: ${firstSignal.message}`,
					pid: null,
					cleanup: "not-needed",
				},
				child: null,
			};
		}

		if (firstSignal.type === "exit") {
			return {
				step: {
					ok: false,
					command,
					exitCode: firstSignal.code,
					timedOut: false,
					durationMs,
					detail: `Start process exited early (exit=${String(firstSignal.code)}, signal=${String(firstSignal.signal)}).`,
					pid: child.pid ?? null,
					cleanup: "already-exited",
				},
				child: null,
			};
		}

		return {
			step: {
				ok: true,
				command,
				exitCode: null,
				timedOut: false,
				durationMs,
				detail: `Start process is running (pid=${String(child.pid)}).`,
				pid: child.pid ?? null,
				cleanup: "not-needed",
			},
			child,
		};
	} catch (error) {
		return {
			step: {
				ok: false,
				command,
				exitCode: 1,
				timedOut: false,
				durationMs: Date.now() - startedAt,
				detail: `Start execution failed: ${normalizeReason(error)}`,
				pid: null,
				cleanup: "not-needed",
			},
			child: null,
		};
	}
}
