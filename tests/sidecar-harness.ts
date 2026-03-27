import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type JsonRpcResponse = {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: Record<string, unknown>;
	};
};

type SidecarHarness = {
	request: (
		id: number,
		method: string,
		params: Record<string, unknown>,
	) => Promise<JsonRpcResponse>;
	stop: () => void;
	cleanup: () => Promise<void>;
};

const PROCESS_EXIT_WAIT_TIMEOUT_MS = 3_000;

function waitForProcessExit(
	proc: ChildProcessWithoutNullStreams,
	timeoutMs: number,
): Promise<void> {
	if (proc.exitCode !== null || proc.signalCode !== null) {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		let settled = false;
		const done = () => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			proc.off("exit", done);
			resolve();
		};

		const timeout = setTimeout(done, timeoutMs);
		proc.once("exit", done);
	});
}

async function writeFakeGeminiSdk(rootDir: string): Promise<void> {
	const googleDir = path.join(rootDir, "google");
	const genaiDir = path.join(googleDir, "genai");
	await mkdir(genaiDir, { recursive: true });

	await writeFile(path.join(googleDir, "__init__.py"), "");
	await writeFile(
		path.join(genaiDir, "__init__.py"),
		[
			"import json",
			"from . import types",
			"",
			"def _plain(value):",
			"    if value is None or isinstance(value, (str, int, float, bool)):",
			"        return value",
			"    if isinstance(value, list):",
			"        return [_plain(item) for item in value]",
			"    if isinstance(value, dict):",
			"        return {str(key): _plain(val) for key, val in value.items()}",
			"    if hasattr(value, 'to_dict'):",
			"        return _plain(value.to_dict())",
			"    if hasattr(value, '__dict__'):",
			"        return _plain(vars(value))",
			"    return repr(value)",
			"",
			"class _Models:",
			"    def generate_content(self, **kwargs):",
			"        payload = _plain(kwargs)",
			"        return {",
			"            'candidates': [",
			"                {'content': {'parts': [{'text': json.dumps(payload, sort_keys=True)}]}}",
			"            ]",
			"        }",
			"",
			"class Client:",
			"    def __init__(self, api_key=None):",
			"        self.api_key = api_key",
			"        self.models = _Models()",
			"",
			"__all__ = ['Client', 'types']",
			"",
		].join("\n"),
	);

	await writeFile(
		path.join(genaiDir, "types.py"),
		[
			"class _Base:",
			"    def __init__(self, **kwargs):",
			"        for key, value in kwargs.items():",
			"            setattr(self, key, value)",
			"",
			"    def to_dict(self):",
			"        return dict(vars(self))",
			"",
			"class ThinkingConfig(_Base):",
			"    pass",
			"",
			"class GenerateContentConfig(_Base):",
			"    pass",
			"",
			"class FunctionCallingConfig(_Base):",
			"    pass",
			"",
			"class ToolConfig(_Base):",
			"    pass",
			"",
			"class ComputerUse(_Base):",
			"    pass",
			"",
			"class Tool(_Base):",
			"    pass",
			"",
			"class EmbedContentConfig(_Base):",
			"    pass",
			"",
			"class Environment:",
			"    ENVIRONMENT_BROWSER = 'BROWSER'",
			"",
		].join("\n"),
	);
}

function requestOnce(
	proc: ChildProcessWithoutNullStreams,
	payload: Record<string, unknown>,
): Promise<JsonRpcResponse> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let buffer = "";
		const done = (fn: () => void) => {
			if (settled) {
				return;
			}
			settled = true;
			fn();
		};

		const onData = (chunk: Buffer | string) => {
			buffer += String(chunk);
			const newline = buffer.indexOf("\n");
			if (newline === -1) {
				return;
			}
			const line = buffer.slice(0, newline).trim();
			if (!line) {
				return;
			}
			done(() => {
				proc.stdout.off("data", onData);
				clearTimeout(timeoutId);
				try {
					resolve(JSON.parse(line) as JsonRpcResponse);
				} catch (error) {
					reject(error);
				}
			});
		};

		const timeoutId = setTimeout(() => {
			done(() => {
				proc.stdout.off("data", onData);
				reject(new Error("sidecar test timed out"));
			});
		}, 8_000);

		proc.stdout.on("data", onData);
		proc.stdin.write(`${JSON.stringify(payload)}\n`);
	});
}

export async function createSidecarHarness(): Promise<SidecarHarness> {
	const tempRoot = await mkdtemp(
		path.join(os.tmpdir(), "gemini-sidecar-test-"),
	);
	await writeFakeGeminiSdk(tempRoot);

	const scriptPath = path.resolve(process.cwd(), "services/gemini-sidecar/server.py");
	const existingPythonPath = process.env.PYTHONPATH?.trim();
	const pythonPath = existingPythonPath
		? `${tempRoot}${path.delimiter}${existingPythonPath}`
		: tempRoot;

	const proc = spawn(
		process.env.OPENUI_GEMINI_PYTHON_BIN || "python3",
		[scriptPath],
		{
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				PYTHONPATH: pythonPath,
				PYTHONUNBUFFERED: "1",
			},
		},
	);
	let stopPromise: Promise<void> | null = null;
	const ensureStopped = (): Promise<void> => {
		if (stopPromise) {
			return stopPromise;
		}
		if (proc.exitCode === null && proc.signalCode === null) {
			proc.kill("SIGKILL");
		}
		stopPromise = waitForProcessExit(proc, PROCESS_EXIT_WAIT_TIMEOUT_MS);
		return stopPromise;
	};

	return {
		request: (id: number, method: string, params: Record<string, unknown>) =>
			requestOnce(proc, {
				jsonrpc: "2.0",
				id,
				method,
				params,
			}),
		stop: () => {
			void ensureStopped();
		},
		cleanup: async () => {
			await ensureStopped();
			await rm(tempRoot, { recursive: true, force: true });
		},
	};
}
