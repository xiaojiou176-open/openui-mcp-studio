import { spawn } from "node:child_process";
import path from "node:path";

const DEFAULT_INTERVAL_MS = 30_000;
const HEARTBEAT_EXIT_TIMEOUT_MS = 1_500;
const HEARTBEAT_FORCE_KILL_TIMEOUT_MS = 500;
const HEARTBEAT_SCRIPT = path.resolve("tooling/test-heartbeat.mjs");

function parseArgs(argv) {
	let label = "task";
	let intervalMs = DEFAULT_INTERVAL_MS;
	const separatorIndex = argv.indexOf("--");
	if (separatorIndex === -1 || separatorIndex === argv.length - 1) {
		throw new Error(
			"Usage: node tooling/run-with-heartbeat.mjs [--label=<name>] [--interval-ms=<ms>] -- <command> [args...]",
		);
	}

	for (const argument of argv.slice(0, separatorIndex)) {
		if (argument.startsWith("--label=")) {
			label = argument.slice("--label=".length).trim() || label;
			continue;
		}
		if (argument.startsWith("--interval-ms=")) {
			const parsed = Number(argument.slice("--interval-ms=".length));
			if (Number.isInteger(parsed) && parsed > 0) {
				intervalMs = parsed;
			}
		}
	}

	return {
		label,
		intervalMs,
		command: argv[separatorIndex + 1],
		args: argv.slice(separatorIndex + 2),
	};
}

function isProcessExited(childProcess) {
	return (
		!childProcess ||
		childProcess.exitCode !== null ||
		childProcess.signalCode !== null
	);
}

function hasRealProcessId(childProcess) {
	return Number.isInteger(childProcess?.pid) && childProcess.pid > 0;
}

function waitForProcessExit(childProcess, timeoutMs) {
	if (isProcessExited(childProcess)) {
		return Promise.resolve(true);
	}

	return new Promise((resolve) => {
		let settled = false;
		let timer;
		const finalize = (exited) => {
			if (settled) {
				return;
			}
			settled = true;
			if (timer) {
				clearTimeout(timer);
			}
			childProcess.off("exit", onExit);
			childProcess.off("close", onExit);
			resolve(exited);
		};
		const onExit = () => finalize(true);

		childProcess.once("exit", onExit);
		childProcess.once("close", onExit);
		if (isProcessExited(childProcess)) {
			finalize(true);
			return;
		}

		timer = setTimeout(
			() => finalize(isProcessExited(childProcess)),
			timeoutMs,
		);
		timer.unref?.();
	});
}

async function terminateHeartbeat(heartbeat, contextLabel) {
	if (
		!heartbeat ||
		heartbeat.exitCode !== null ||
		heartbeat.signalCode !== null
	) {
		return;
	}
	heartbeat.kill("SIGTERM");
	if (!hasRealProcessId(heartbeat)) {
		return;
	}
	const exitedAfterTerm = await waitForProcessExit(
		heartbeat,
		HEARTBEAT_EXIT_TIMEOUT_MS,
	);
	if (exitedAfterTerm || isProcessExited(heartbeat)) {
		return;
	}
	process.stderr.write(
		`[run-with-heartbeat] heartbeat did not exit after SIGTERM within ${HEARTBEAT_EXIT_TIMEOUT_MS}ms (${contextLabel}); forcing SIGKILL\n`,
	);
	heartbeat.kill("SIGKILL");
	await waitForProcessExit(heartbeat, HEARTBEAT_FORCE_KILL_TIMEOUT_MS);
}

function main() {
	const { label, intervalMs, command, args } = parseArgs(process.argv.slice(2));
	const heartbeat = spawn(
		process.execPath,
		[HEARTBEAT_SCRIPT, `--label=${label}`, `--interval-ms=${intervalMs}`],
		{
			stdio: ["ignore", "inherit", "inherit"],
			env: process.env,
		},
	);
	heartbeat.unref?.();

	const child = spawn(command, args, {
		stdio: ["inherit", "inherit", "inherit"],
		env: process.env,
	});

	child.once("error", async (error) => {
		await terminateHeartbeat(heartbeat, "child-error");
		process.stderr.write(
			`[run-with-heartbeat] command spawn failed: ${error.message}\n`,
		);
		process.exit(1);
	});

	child.once("close", async (code, signal) => {
		await terminateHeartbeat(heartbeat, "child-close");
		if (signal) {
			process.stderr.write(
				`[run-with-heartbeat] command terminated by signal ${signal}\n`,
			);
			process.exit(1);
		}
		process.exit(code ?? 1);
	});
}

main();
