#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { buildSafeToolCacheEnv } from "./shared/tool-cache-env.mjs";

const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";
const WARNING_PATTERN = /\b(warn(?:ing)?|deprecated)\b/iu;
const WARNING_ALLOWLIST = [/ExperimentalWarning/iu];

const PROFILE_DEFINITIONS = {
	"precommit-strict": [
		{
			id: "fast-gates",
			mode: "parallel",
			tasks: [
				{
					name: "secrets-scan",
					command: "bash",
					args: ["tooling/secrets_scan.sh", "--staged"],
				},
				{
					name: "env-governance",
					command: "node",
					args: ["tooling/verify-env-governance.mjs", "--staged"],
				},
				{
					name: "governance-contract",
					command: "node",
					args: ["tooling/check-governance-contract.mjs"],
				},
				{
					name: "lint-staged",
					command: NPM_BIN,
					args: ["run", "-s", "lint:staged"],
				},
				{
					name: "typecheck",
					command: NPM_BIN,
					args: ["run", "-s", "typecheck"],
				},
			],
		},
	],
	"prepush-light": [
		{
			id: "light-gates",
			mode: "parallel",
			tasks: [
				{
					name: "iac-check",
					command: "node",
					args: ["tooling/check-iac-consistency.mjs"],
				},
				{
					name: "workflow-governance",
					command: "node",
					args: ["tooling/check-workflow-governance.mjs"],
				},
				{
					name: "resource-leak-audit-full",
					command: "node",
					args: ["tooling/check-resource-leaks.mjs"],
				},
				{
					name: "test-fast-gate",
					command: NPM_BIN,
					args: ["run", "-s", "test:fast:gate"],
				},
				{
					name: "anti-placebo-guard",
					command: "node",
					args: [
						"--env-file-if-exists=.env",
						"./node_modules/vitest/vitest.mjs",
						"run",
						"tests/non-placebo-assertions-guard.test.ts",
						"tests/ci-workflow-hardening.test.ts",
					],
				},
			],
		},
	],
};

function resolveProfile() {
	const modeArgument = process.argv.find((arg) => arg.startsWith("--mode="));
	const requested =
		(modeArgument ? modeArgument.slice("--mode=".length) : "") ||
		process.env.PRECOMMIT_GATE_PROFILE ||
		"precommit-strict";
	if (requested in PROFILE_DEFINITIONS) {
		return { profile: requested, phases: PROFILE_DEFINITIONS[requested] };
	}
	throw new Error(
		`unsupported precommit gate profile: ${requested}. supported: ${Object.keys(PROFILE_DEFINITIONS).join(", ")}`,
	);
}

const { profile, phases: PHASES } = resolveProfile();

function pipeWithPrefix(stream, prefix, write) {
	stream.setEncoding("utf8");
	let buffer = "";
	const warningLines = [];
	stream.on("data", (chunk) => {
		buffer += chunk;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (
				WARNING_PATTERN.test(line) &&
				!WARNING_ALLOWLIST.some((pattern) => pattern.test(line))
			) {
				warningLines.push(line.trim());
			}
			write(`[${prefix}] ${line}\n`);
		}
	});
	stream.on("end", () => {
		if (buffer.length > 0) {
			if (
				WARNING_PATTERN.test(buffer) &&
				!WARNING_ALLOWLIST.some((pattern) => pattern.test(buffer))
			) {
				warningLines.push(buffer.trim());
			}
			write(`[${prefix}] ${buffer}\n`);
		}
	});
	return warningLines;
}

function formatDuration(ms) {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remainSeconds = seconds % 60;
	return `${minutes}m${String(remainSeconds).padStart(2, "0")}s`;
}

async function buildGateTaskEnv(options = {}) {
	return buildSafeToolCacheEnv({
		rootDir: path.resolve(options.rootDir ?? process.cwd()),
		env: options.env ?? process.env,
	});
}

async function main() {
	console.log(
		`[pre-commit] policy profile=${profile}: short checks first, heavy checks stay in CI. each phase runs in parallel.`,
	);

	const startedAt = Date.now();
	const running = new Map();
	let activePhase = "idle";
	const heartbeat = setInterval(() => {
		if (running.size === 0) {
			return;
		}
		const names = Array.from(running.keys()).join(", ");
		console.log(
			`[pre-commit] heartbeat +${formatDuration(Date.now() - startedAt)} phase=${activePhase} running: ${names}`,
		);
	}, 15000);
	heartbeat.unref?.();

	try {
		const safeEnv = await buildGateTaskEnv();
		for (const phase of PHASES) {
			activePhase = phase.id;
			console.log(
				`[pre-commit] phase ${phase.id}: ${phase.tasks.map((task) => task.name).join(", ")}`,
			);

			const completionQueue = phase.tasks.map((task) => {
				console.log(`[pre-commit] start ${task.name}`);
				const child = spawn(task.command, task.args, {
					stdio: ["ignore", "pipe", "pipe"],
					env: safeEnv,
				});
				running.set(task.name, child);
				const warningLines = [];
				warningLines.push(
					...pipeWithPrefix(child.stdout, task.name, (line) =>
						process.stdout.write(line),
					),
				);
				warningLines.push(
					...pipeWithPrefix(child.stderr, task.name, (line) =>
						process.stderr.write(line),
					),
				);

				return new Promise((resolve) => {
					let settled = false;
					child.on("error", (error) => {
						if (settled) {
							return;
						}
						settled = true;
						running.delete(task.name);
						console.error(
							`[pre-commit] ${task.name} spawn error: ${error.message}`,
						);
						resolve({ task, code: 1, signal: null, warningLines });
					});
					child.on("close", (code, signal) => {
						if (settled) {
							return;
						}
						settled = true;
						running.delete(task.name);
						console.log(
							`[pre-commit] done ${task.name} code=${code ?? 1}${signal ? ` signal=${signal}` : ""}`,
						);
						resolve({ task, code: code ?? 1, signal, warningLines });
					});
				});
			});

			const results = await Promise.all(completionQueue);
			const failed = results.filter((result) => result.code !== 0);
			const warningHits = results.flatMap((result) =>
				result.warningLines.map((line) => ({
					taskName: result.task.name,
					line,
				})),
			);

			if (failed.length > 0) {
				console.error("[pre-commit] FAILED");
				for (const result of failed) {
					console.error(
						`  - ${result.task.name} exited with code=${result.code}${result.signal ? ` signal=${result.signal}` : ""}`,
					);
				}
				process.exit(1);
			}

			if (warningHits.length > 0) {
				console.error("[pre-commit] FAILED");
				console.error("  - zero-tolerance warnings detected:");
				for (const hit of warningHits.slice(0, 20)) {
					console.error(`    [${hit.taskName}] ${hit.line}`);
				}
				if (warningHits.length > 20) {
					console.error(
						`    ... and ${warningHits.length - 20} more warning line(s)`,
					);
				}
				console.error(
					"  - resolve warnings before commit (or remove false positives from WARNING_ALLOWLIST with justification).",
				);
				process.exit(1);
			}
		}
	} finally {
		clearInterval(heartbeat);
	}

	console.log(
		`[pre-commit] PASSED in ${formatDuration(Date.now() - startedAt)}`,
	);
}

process.on("uncaughtException", (error) => {
	console.error(
		`[pre-commit] uncaught exception: ${error?.stack ?? String(error)}`,
	);
	process.exit(1);
});

process.on("unhandledRejection", (reason) => {
	console.error(
		`[pre-commit] unhandled rejection: ${
			reason instanceof Error
				? (reason.stack ?? reason.message)
				: String(reason)
		}`,
	);
	process.exit(1);
});

main().catch((error) => {
	console.error(`[pre-commit] fatal: ${error?.stack ?? String(error)}`);
	process.exit(1);
});

export { buildGateTaskEnv };
