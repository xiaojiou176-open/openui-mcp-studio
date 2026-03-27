import type { ChildProcess } from "node:child_process";
import { normalizeReason } from "./logging.js";
import type { NextSmokeStartResult } from "./types.js";

export type ChildProcessHandle = ChildProcess;

export async function waitForExitWithTimeout(
	child: ChildProcessHandle,
	timeoutMs: number,
): Promise<{
	exited: boolean;
	code: number | null;
	signal: NodeJS.Signals | null;
}> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return {
			exited: true,
			code: child.exitCode,
			signal: child.signalCode,
		};
	}

	return await new Promise<{
		exited: boolean;
		code: number | null;
		signal: NodeJS.Signals | null;
	}>((resolve) => {
		let settled = false;
		const timeout = setTimeout(() => {
			settle({
				exited: false,
				code: child.exitCode,
				signal: child.signalCode,
			});
		}, timeoutMs);

		const settle = (result: {
			exited: boolean;
			code: number | null;
			signal: NodeJS.Signals | null;
		}): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			child.off("exit", onExit);
			child.off("error", onError);
			resolve(result);
		};

		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			settle({
				exited: true,
				code,
				signal,
			});
		};

		const onError = () => {
			settle({
				exited: false,
				code: child.exitCode,
				signal: child.signalCode,
			});
		};

		child.once("exit", onExit);
		child.once("error", onError);
	});
}

export async function terminateChildProcess(
	child: ChildProcessHandle,
): Promise<{
	ok: boolean;
	cleanup: NextSmokeStartResult["cleanup"];
	detail: string;
}> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return {
			ok: true,
			cleanup: "already-exited",
			detail: "Process already exited before cleanup.",
		};
	}

	try {
		child.kill("SIGTERM");
	} catch (error) {
		return {
			ok: false,
			cleanup: "failed",
			detail: `Failed to send SIGTERM: ${normalizeReason(error)}`,
		};
	}

	const termWait = await waitForExitWithTimeout(child, 1_500);
	if (termWait.exited) {
		return {
			ok: true,
			cleanup: "sigterm",
			detail: `Process terminated after SIGTERM (exit=${String(termWait.code)}, signal=${String(termWait.signal)}).`,
		};
	}

	try {
		if (process.platform !== "win32" && typeof child.pid === "number") {
			process.kill(-child.pid, "SIGKILL");
		} else {
			child.kill("SIGKILL");
		}
	} catch {
		try {
			child.kill("SIGKILL");
		} catch (error) {
			return {
				ok: false,
				cleanup: "failed",
				detail: `Failed to send SIGKILL: ${normalizeReason(error)}`,
			};
		}
	}

	const killWait = await waitForExitWithTimeout(child, 1_500);
	if (killWait.exited) {
		return {
			ok: true,
			cleanup: "sigkill",
			detail: `Process terminated after SIGKILL (exit=${String(killWait.code)}, signal=${String(killWait.signal)}).`,
		};
	}

	return {
		ok: false,
		cleanup: "failed",
		detail: "Process did not terminate after SIGTERM/SIGKILL.",
	};
}
