import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import { buildChildEnvFromAllowlist } from "../shared/child-env.mjs";
import { DEFAULT_STAGES, VALID_STAGE_MODES } from "./stages.mjs";

const TRUNCATED_MARKER = "\n[truncated]\n";
const DEFAULT_TASK_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_PIPELINE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const DEFAULT_TASK_FORCE_KILL_AFTER_MS = 1_000;
const DEFAULT_MAX_STDOUT_BYTES = 256 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 256 * 1024;

function resolvePositiveInteger(value, fallback) {
	if (typeof value === "number" && Number.isInteger(value) && value > 0) {
		return value;
	}
	return fallback;
}

function parsePositiveIntegerFromEnv(envName, fallback) {
	const raw = process.env[envName]?.trim();
	if (!raw) {
		return fallback;
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

function formatDurationMs(milliseconds) {
	const seconds = Math.max(0, Math.floor(milliseconds / 1000));
	return `${seconds}s`;
}

function appendChunkWithLimit(current, chunk, maxBytes) {
	const availableBytes = maxBytes - Buffer.byteLength(current);
	if (availableBytes <= 0) {
		return { value: current, truncated: true };
	}

	const chunkBuffer = Buffer.isBuffer(chunk)
		? chunk
		: Buffer.from(String(chunk));
	if (chunkBuffer.byteLength <= availableBytes) {
		return {
			value: current + chunkBuffer.toString("utf8"),
			truncated: false,
		};
	}

	return {
		value: current + chunkBuffer.subarray(0, availableBytes).toString("utf8"),
		truncated: true,
	};
}

function parseCommandToArgv(command) {
	const input = String(command ?? "").trim();
	if (!input) {
		throw new Error("Task command cannot be empty.");
	}

	const tokens = [];
	let token = "";
	let quote = null;
	let escaped = false;

	for (const char of input) {
		if (escaped) {
			token += char;
			escaped = false;
			continue;
		}

		if (char === "\\") {
			escaped = true;
			continue;
		}

		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				token += char;
			}
			continue;
		}

		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}

		if (/\s/.test(char)) {
			if (token) {
				tokens.push(token);
				token = "";
			}
			continue;
		}

		token += char;
	}

	if (escaped) {
		token += "\\";
	}
	if (quote) {
		throw new Error(`Unterminated quote in command: ${input}`);
	}
	if (token) {
		tokens.push(token);
	}
	if (tokens.length === 0) {
		throw new Error("Task command cannot be empty.");
	}

	return {
		executable: tokens[0],
		args: tokens.slice(1),
	};
}

function collectResourceLocks(task) {
	if (!Array.isArray(task?.resourceLocks)) {
		return [];
	}
	return task.resourceLocks
		.map((value) => String(value ?? "").trim())
		.filter((value) => value.length > 0);
}

function validateStagesConfiguration(stages) {
	if (!Array.isArray(stages) || stages.length === 0) {
		throw new Error("CI gate stages must be a non-empty array.");
	}

	const seenStageIds = new Set();
	for (const stage of stages) {
		const stageId = String(stage?.id ?? "").trim();
		const stageName = String(stage?.name ?? "").trim();
		const stageMode = String(stage?.mode ?? "").trim();

		if (!stageId) {
			throw new Error("CI gate stage id must be a non-empty string.");
		}
		if (seenStageIds.has(stageId)) {
			throw new Error(
				`CI gate stage id must be unique (duplicate: ${stageId}).`,
			);
		}
		seenStageIds.add(stageId);

		if (!stageName) {
			throw new Error(`CI gate stage ${stageId} must define a non-empty name.`);
		}
		if (!VALID_STAGE_MODES.has(stageMode)) {
			throw new Error(
				`CI gate stage ${stageId} has invalid mode "${stageMode}". Valid values: parallel, sequential.`,
			);
		}
		if (!Array.isArray(stage.tasks) || stage.tasks.length === 0) {
			throw new Error(
				`CI gate stage ${stageId} must contain at least one task.`,
			);
		}

		const seenTaskIds = new Set();
		for (const task of stage.tasks) {
			const taskId = String(task?.id ?? "").trim();
			const command = String(task?.command ?? "").trim();

			if (!taskId) {
				throw new Error(`CI gate stage ${stageId} has task with empty id.`);
			}
			if (seenTaskIds.has(taskId)) {
				throw new Error(
					`CI gate stage ${stageId} has duplicate task id "${taskId}".`,
				);
			}
			seenTaskIds.add(taskId);

			if (!command) {
				throw new Error(
					`CI gate task ${taskId} in stage ${stageId} has an empty command.`,
				);
			}
			if (
				task?.timeoutMs !== undefined &&
				(!Number.isInteger(task.timeoutMs) || task.timeoutMs <= 0)
			) {
				throw new Error(
					`CI gate task ${taskId} in stage ${stageId} has invalid timeoutMs "${task.timeoutMs}".`,
				);
			}

			const resourceLocks = collectResourceLocks(task);
			if (resourceLocks.length !== new Set(resourceLocks).size) {
				throw new Error(
					`CI gate task ${taskId} in stage ${stageId} has duplicate resource locks.`,
				);
			}
		}
	}
}

function assertParallelStageResourceIsolation(stages) {
	for (const stage of stages) {
		if (stage.mode !== "parallel") {
			continue;
		}
		const seen = new Map();
		for (const task of stage.tasks) {
			for (const lock of collectResourceLocks(task)) {
				const owner = seen.get(lock);
				if (owner) {
					throw new Error(
						`Parallel stage ${stage.id} has resource lock conflict on "${lock}" between ${owner} and ${task.id}.`,
					);
				}
				seen.set(lock, task.id);
			}
		}
	}
}

function createDefaultRunner(spawnImpl = spawn) {
	return async (task, context) => {
		const childEnv = buildChildEnvFromAllowlist();
		const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
		if (geminiApiKey) {
			childEnv.GEMINI_API_KEY = geminiApiKey;
		}
		const taskTimeoutMs = resolvePositiveInteger(
			context.taskTimeoutMs,
			parsePositiveIntegerFromEnv(
				"CI_GATE_TASK_TIMEOUT_MS",
				DEFAULT_TASK_TIMEOUT_MS,
			),
		);
		const forceKillAfterMs = resolvePositiveInteger(
			context.forceKillAfterMs,
			DEFAULT_TASK_FORCE_KILL_AFTER_MS,
		);
		const maxStdoutBytes = resolvePositiveInteger(
			context.maxStdoutBytes,
			parsePositiveIntegerFromEnv(
				"CI_GATE_MAX_STDOUT_BYTES",
				DEFAULT_MAX_STDOUT_BYTES,
			),
		);
		const maxStderrBytes = resolvePositiveInteger(
			context.maxStderrBytes,
			parsePositiveIntegerFromEnv(
				"CI_GATE_MAX_STDERR_BYTES",
				DEFAULT_MAX_STDERR_BYTES,
			),
		);
		return new Promise((resolve) => {
			const argv = parseCommandToArgv(task.command);
			const child = spawnImpl(argv.executable, argv.args, {
				cwd: context.cwd,
				env: childEnv,
				stdio: ["ignore", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";
			let stdoutTruncated = false;
			let stderrTruncated = false;
			let timedOut = false;
			let resolved = false;
			let forceKillTimer;

			const timeoutId = setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
				forceKillTimer = setTimeout(() => {
					child.kill("SIGKILL");
				}, forceKillAfterMs);
			}, taskTimeoutMs);

			const finalize = (result) => {
				if (resolved) {
					return;
				}
				resolved = true;
				clearTimeout(timeoutId);
				if (forceKillTimer) {
					clearTimeout(forceKillTimer);
				}
				resolve(result);
			};

			child.stdout?.on("data", (chunk) => {
				const next = appendChunkWithLimit(stdout, chunk, maxStdoutBytes);
				stdout = next.value;
				stdoutTruncated = stdoutTruncated || next.truncated;
			});

			child.stderr?.on("data", (chunk) => {
				const next = appendChunkWithLimit(stderr, chunk, maxStderrBytes);
				stderr = next.value;
				stderrTruncated = stderrTruncated || next.truncated;
			});

			child.on("error", (error) => {
				finalize({
					exitCode: 1,
					stdout: stdoutTruncated ? `${stdout}${TRUNCATED_MARKER}` : stdout,
					stderr:
						(stderrTruncated ? `${stderr}${TRUNCATED_MARKER}` : stderr) ||
						error.message,
				});
			});

			child.on("close", (code, signal) => {
				const normalizedSignal = signal ? ` (signal: ${signal})` : "";
				const timeoutError = timedOut
					? `Command timed out after ${taskTimeoutMs}ms.`
					: "";
				const closeError =
					code === 0
						? ""
						: `Command exited with code ${code ?? "null"}${normalizedSignal}`;
				const normalizedStdout = stdoutTruncated
					? `${stdout}${TRUNCATED_MARKER}`
					: stdout;
				const normalizedStderr = stderrTruncated
					? `${stderr}${TRUNCATED_MARKER}`
					: stderr;
				const mergedStderr = [normalizedStderr.trim(), timeoutError, closeError]
					.filter(Boolean)
					.join("\n");
				const exitCode =
					timedOut && code === 0 ? 124 : typeof code === "number" ? code : 1;

				finalize({
					exitCode,
					stdout: normalizedStdout.trim(),
					stderr: mergedStderr,
				});
			});
		});
	};
}

function createSkippedStage(stage) {
	return {
		id: stage.id,
		name: stage.name,
		status: "skipped",
		durationMs: 0,
		tasks: stage.tasks.map((task) => ({
			id: task.id,
			command: task.command,
			category: task.category ?? "business",
			status: "skipped",
			exitCode: null,
			durationMs: 0,
			stdout: "",
			stderr: "",
			hint: null,
		})),
	};
}

function createTaskHeartbeat(task, stage, context) {
	const heartbeatIntervalMs = resolvePositiveInteger(
		context.heartbeatIntervalMs,
		parsePositiveIntegerFromEnv(
			"CI_GATE_HEARTBEAT_INTERVAL_MS",
			DEFAULT_HEARTBEAT_INTERVAL_MS,
		),
	);
	if (heartbeatIntervalMs <= 0) {
		return () => {};
	}

	const writeHeartbeat =
		context.writeHeartbeat ?? ((line) => process.stderr.write(line));
	const taskStartedAt = context.clock();
	const emitHeartbeat = (state) => {
		const now = context.clock();
		const elapsedMs = Math.max(0, now - taskStartedAt);
		const globalRemainingMs = Math.max(0, context.deadlineAt - now);
		const timestamp = new Date().toISOString();
		writeHeartbeat(
			`[ci:gate][heartbeat] ts=${timestamp} stage=${stage.id} task=${task.id} state=${state} elapsed=${formatDurationMs(elapsedMs)} taskTimeout=${formatDurationMs(context.taskTimeoutMs)} globalRemaining=${formatDurationMs(globalRemainingMs)}\n`,
		);
	};

	emitHeartbeat("started");
	const timerId = globalThis.setInterval(() => {
		emitHeartbeat("running");
	}, heartbeatIntervalMs);
	timerId.unref?.();

	return () => {
		globalThis.clearInterval(timerId);
		emitHeartbeat("completed");
	};
}

async function executeTask(task, stage, context) {
	const startedAt = context.clock();
	const stopHeartbeat = createTaskHeartbeat(task, stage, context);
	const remainingMs = Math.max(0, context.deadlineAt - startedAt);
	if (remainingMs <= 0) {
		stopHeartbeat();
		return {
			id: task.id,
			command: task.command,
			category: task.category ?? "business",
			status: "failed",
			exitCode: 124,
			durationMs: 0,
			stdout: "",
			stderr: "CI gate global timeout reached before task execution.",
			hint: task.hint,
		};
	}

	const effectiveTimeoutMs = Math.max(
		1,
		Math.min(task.timeoutMs ?? context.taskTimeoutMs, remainingMs),
	);
	let output;
	let globalTimeoutId;
	try {
		output = await Promise.race([
			context.runTask(task, { ...context, taskTimeoutMs: effectiveTimeoutMs }),
			new Promise((resolve) => {
				globalTimeoutId = setTimeout(() => {
					resolve({
						exitCode: 124,
						stdout: "",
						stderr: `CI gate global timeout reached while running ${task.id}.`,
					});
				}, remainingMs);
			}),
		]);
	} catch (error) {
		output = {
			exitCode: 1,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
		};
	} finally {
		if (globalTimeoutId) {
			clearTimeout(globalTimeoutId);
		}
		stopHeartbeat();
	}

	const durationMs = Math.max(0, context.clock() - startedAt);
	const exitCode = Number.isInteger(output?.exitCode) ? output.exitCode : 1;
	const isAdvisory = task.advisory === true;
	const hasFailure = exitCode !== 0;
	const status = hasFailure ? (isAdvisory ? "warning" : "failed") : "passed";

	return {
		id: task.id,
		command: task.command,
		category: task.category ?? "business",
		advisory: isAdvisory,
		status,
		exitCode,
		durationMs,
		stdout: output?.stdout ?? "",
		stderr: output?.stderr ?? "",
		hint: hasFailure ? task.hint : null,
	};
}

async function executeStage(stage, context) {
	const stageStartedAt = context.clock();
	const taskResults = [];

	if (stage.mode === "parallel") {
		const results = await Promise.all(
			stage.tasks.map((task) => executeTask(task, stage, context)),
		);
		taskResults.push(...results);
	} else {
		for (const task of stage.tasks) {
			taskResults.push(await executeTask(task, stage, context));
		}
	}

	const stageDurationMs = Math.max(0, context.clock() - stageStartedAt);
	const failed = taskResults.some((task) => task.status === "failed");
	const warningCount = taskResults.filter(
		(task) => task.status === "warning",
	).length;

	return {
		id: stage.id,
		name: stage.name,
		status: failed
			? "failed"
			: warningCount > 0
				? "passed_with_warnings"
				: "passed",
		durationMs: stageDurationMs,
		warningCount,
		tasks: taskResults,
	};
}

function detectNoVerifyCommits(warnings) {
	if (process.env.GITHUB_ACTIONS !== "true") {
		return;
	}
	const baseRef = process.env.GITHUB_BASE_REF
		? `origin/${process.env.GITHUB_BASE_REF}`
		: "origin/main";
	try {
		const logResult = execFileSync(
			"git",
			["log", `${baseRef}...HEAD`, "--format=%H %s"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
		const commits = logResult.trim().split("\n").filter(Boolean);
		for (const line of commits) {
			const hash = line.slice(0, 40);
			const trailers = execFileSync(
				"git",
				[
					"log",
					"-1",
					"--format=%(trailers:key=Pre-commit-hook,valueonly)",
					hash,
				],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
			).trim();
			if (!trailers) {
				const subject = line.slice(41);
				const msg = `Commit ${hash.slice(0, 8)} ("${subject}") may have skipped local hooks (--no-verify)`;
				warnings.push({
					stageId: "audit",
					stageName: "Audit",
					taskId: "possibleNoVerifyCommit",
					command: "git log",
					hint: msg,
					stderr: "",
				});
				process.stderr.write(
					`::warning title=Possible --no-verify commit::${msg}\n`,
				);
			}
		}
	} catch {
		// Non-fatal: if git log fails (e.g. shallow clone), skip detection
	}
}

async function runCiGate(options = {}) {
	const clock = options.clock ?? (() => Date.now());
	const stages = options.stages ?? DEFAULT_STAGES;
	const timeoutMs = resolvePositiveInteger(
		options.timeoutMs,
		parsePositiveIntegerFromEnv(
			"CI_GATE_TIMEOUT_MS",
			DEFAULT_PIPELINE_TIMEOUT_MS,
		),
	);
	const taskTimeoutMs = resolvePositiveInteger(
		options.taskTimeoutMs,
		parsePositiveIntegerFromEnv(
			"CI_GATE_TASK_TIMEOUT_MS",
			DEFAULT_TASK_TIMEOUT_MS,
		),
	);
	const heartbeatIntervalMs = resolvePositiveInteger(
		options.heartbeatIntervalMs,
		parsePositiveIntegerFromEnv(
			"CI_GATE_HEARTBEAT_INTERVAL_MS",
			DEFAULT_HEARTBEAT_INTERVAL_MS,
		),
	);
	const maxStdoutBytes = resolvePositiveInteger(
		options.maxStdoutBytes,
		parsePositiveIntegerFromEnv(
			"CI_GATE_MAX_STDOUT_BYTES",
			DEFAULT_MAX_STDOUT_BYTES,
		),
	);
	const maxStderrBytes = resolvePositiveInteger(
		options.maxStderrBytes,
		parsePositiveIntegerFromEnv(
			"CI_GATE_MAX_STDERR_BYTES",
			DEFAULT_MAX_STDERR_BYTES,
		),
	);
	const startedAt = new Date().toISOString();
	const pipelineStartedAt = clock();
	validateStagesConfiguration(stages);
	assertParallelStageResourceIsolation(stages);
	const context = {
		cwd: options.cwd ?? process.cwd(),
		clock,
		deadlineAt: pipelineStartedAt + timeoutMs,
		taskTimeoutMs,
		heartbeatIntervalMs,
		maxStdoutBytes,
		maxStderrBytes,
		writeHeartbeat: options.writeHeartbeat,
		runTask: options.runTask ?? createDefaultRunner(),
	};

	const stageResults = [];
	const warnings = [];
	let failed = false;

	detectNoVerifyCommits(warnings);

	for (const stage of stages) {
		if (failed) {
			stageResults.push(createSkippedStage(stage));
			continue;
		}

		const stageResult = await executeStage(stage, context);
		stageResults.push(stageResult);
		warnings.push(
			...stageResult.tasks
				.filter((task) => task.status === "warning")
				.map((task) => ({
					stageId: stage.id,
					stageName: stage.name,
					taskId: task.id,
					command: task.command,
					hint: task.hint ?? "",
					stderr: task.stderr ?? "",
				})),
		);
		for (const task of stageResult.tasks) {
			if (task.status === "warning" && process.env.GITHUB_ACTIONS === "true") {
				const title = `Advisory: ${task.id} failed`;
				const message = task.hint || "Check logs";
				console.error(`::warning title=${title}::${message}`);
			}
		}
		if (stageResult.status === "failed") {
			failed = true;
		}
	}

	const pipelineDurationMs = Math.max(0, clock() - pipelineStartedAt);
	const summary = {
		ok: !failed,
		exitCode: failed ? 1 : 0,
		startedAt,
		finishedAt: new Date().toISOString(),
		durationMs: pipelineDurationMs,
		warningCount: warnings.length,
		warnings,
		stages: stageResults,
	};

	return summary;
}

export { createDefaultRunner, runCiGate };
