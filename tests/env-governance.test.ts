import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const constantsModuleUrl = new URL(
	"../services/mcp-server/src/constants.ts",
	import.meta.url,
).href;
const tsxLoaderUrl = pathToFileURL(
	path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs"),
).href;
let cachedEnvFileFlagSupport: boolean | undefined;

function buildChildEnv(overrides: Record<string, string | undefined> = {}) {
	const env = { ...process.env };
	delete env.GEMINI_MODEL;
	delete env.GEMINI_MODEL_STRONG;
	return { ...env, ...overrides };
}

async function supportsEnvFileIfExistsFlag(): Promise<boolean> {
	if (cachedEnvFileFlagSupport !== undefined) {
		return cachedEnvFileFlagSupport;
	}

	try {
		const { stdout, stderr } = await execFileAsync(process.execPath, [
			"--help",
		]);
		cachedEnvFileFlagSupport = `${stdout}\n${stderr}`.includes(
			"--env-file-if-exists",
		);
	} catch {
		cachedEnvFileFlagSupport = false;
	}

	return cachedEnvFileFlagSupport;
}

function parseEnvFile(raw: string): Record<string, string> {
	const parsed: Record<string, string> = {};
	const lines = raw.split(/\r?\n/u);

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const normalized = trimmed.startsWith("export ")
			? trimmed.slice(7).trim()
			: trimmed;
		const equalsIndex = normalized.indexOf("=");
		if (equalsIndex <= 0) {
			continue;
		}

		const key = normalized.slice(0, equalsIndex).trim();
		if (!key) {
			continue;
		}

		let value = normalized.slice(equalsIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		parsed[key] = value;
	}

	return parsed;
}

async function applyEnvFileFallback(input: {
	cwd: string;
	env: NodeJS.ProcessEnv;
}): Promise<void> {
	for (const fileName of [".env"]) {
		try {
			const raw = await fs.readFile(path.join(input.cwd, fileName), "utf8");
			const parsed = parseEnvFile(raw);
			for (const [key, value] of Object.entries(parsed)) {
				if (input.env[key] === undefined) {
					input.env[key] = value;
				}
			}
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "ENOENT") {
				throw error;
			}
		}
	}
}

async function runModelWithEnvFiles(input: {
	cwd: string;
	shellOverride?: string;
}): Promise<string> {
	const modelScript = `import { getOpenuiModel } from ${JSON.stringify(constantsModuleUrl)};process.stdout.write(getOpenuiModel());`;
	const env = buildChildEnv(
		input.shellOverride ? { GEMINI_MODEL: input.shellOverride } : {},
	);
	const nodeArgs = [
		"--input-type=module",
		"--import",
		tsxLoaderUrl,
		"-e",
		modelScript,
	];

	if (await supportsEnvFileIfExistsFlag()) {
		nodeArgs.unshift("--env-file-if-exists=.env");
	} else {
		await applyEnvFileFallback({ cwd: input.cwd, env });
	}

	const { stdout } = await execFileAsync(process.execPath, nodeArgs, {
		cwd: input.cwd,
		env,
	});

	return stdout.trim();
}

async function runConstantExpr(input: {
	cwd: string;
	expression: string;
	envOverrides?: Record<string, string | undefined>;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const script = `import * as constants from ${JSON.stringify(constantsModuleUrl)};process.stdout.write(String(${input.expression}));`;
	const env = buildChildEnv(input.envOverrides);
	const nodeArgs = [
		"--input-type=module",
		"--import",
		tsxLoaderUrl,
		"-e",
		script,
	];

	if (await supportsEnvFileIfExistsFlag()) {
		nodeArgs.unshift("--env-file-if-exists=.env");
	} else {
		await applyEnvFileFallback({ cwd: input.cwd, env });
	}

	try {
		const { stdout, stderr } = await execFileAsync(process.execPath, nodeArgs, {
			cwd: input.cwd,
			env,
		});
		return { stdout, stderr, exitCode: 0 };
	} catch (error) {
		const failed = error as {
			stdout?: string;
			stderr?: string;
			code?: number;
		};
		return {
			stdout: failed.stdout || "",
			stderr: failed.stderr || "",
			exitCode: typeof failed.code === "number" ? failed.code : 1,
		};
	}
}

async function createTempEnvContractFixture(input?: {
	envExampleTransform?: (raw: string) => string;
	docsTransform?: (raw: string) => string;
}): Promise<string> {
	const tempRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), "openui-env-contract-drift-"),
	);
	await fs.mkdir(path.join(tempRoot, "services", "mcp-server", "src"), {
		recursive: true,
	});
	await fs.mkdir(path.join(tempRoot, "packages", "contracts", "src"), {
		recursive: true,
	});
	await fs.mkdir(path.join(tempRoot, "docs"), {
		recursive: true,
	});

	const docsRaw = `# Environment Governance

## Runtime Variables

| Variable | Required | Default | Validation |
| --- | --- | --- | --- |
| \`OPENUI_TIMEOUT_MS\` | No | \`45000\` | Positive number. |
`;
	const envExampleRaw = `# @env OPENUI_TIMEOUT_MS
# description: Per-request model timeout in milliseconds.
# default: 45000
# validation: Positive number.
# sensitive: false
OPENUI_TIMEOUT_MS=45000
`;
	const contractRaw = `export const OPENUI_ENV_KEYS = ["OPENUI_TIMEOUT_MS"] as const;
export type EnvKey = (typeof OPENUI_ENV_KEYS)[number];
export type EnvContractEntry = {
  defaultValue: string | number;
  sensitive: boolean;
  description: string;
  validation: string;
};
export type EnvContract = Readonly<Record<EnvKey, EnvContractEntry>>;
export const OPENUI_ENV_CONTRACT: EnvContract = Object.freeze({
  OPENUI_TIMEOUT_MS: {
    defaultValue: 45000,
    sensitive: false,
    description: "Per-request model timeout in milliseconds.",
    validation: "Positive number.",
  },
});
`;

	const transformedDocs = input?.docsTransform
		? input.docsTransform(docsRaw)
		: docsRaw;
	const transformedEnvExample = input?.envExampleTransform
		? input.envExampleTransform(envExampleRaw)
		: envExampleRaw;

	await Promise.all([
		fs.writeFile(
			path.join(tempRoot, "docs", "environment-governance.md"),
			transformedDocs,
			"utf8",
		),
		fs.writeFile(
			path.join(tempRoot, ".env.example"),
			transformedEnvExample,
			"utf8",
		),
		fs.writeFile(
			path.join(tempRoot, "packages", "contracts", "src", "env-contract.ts"),
			contractRaw,
			"utf8",
		),
	]);

	return tempRoot;
}

function createBufferWriter() {
	let output = "";

	return {
		stream: {
			write(chunk: string | Uint8Array) {
				output += String(chunk);
				return true;
			},
		},
		read() {
			return output;
		},
	};
}

describe("environment governance", () => {
	it("keeps env contract, env example, and env governance section aligned", async () => {
		const { verifyEnvContract } = await import(
			"../tooling/verify-env-contract.mjs"
		);
		const tempRoot = await createTempEnvContractFixture();

		try {
			const result = await verifyEnvContract({ rootDir: tempRoot });

			expect(result.ok).toBe(true);
			expect(result.failOnReadmeDrift).toBe(true);
			expect(result.issues).toEqual([]);
			expect(result.blockingIssues).toEqual([]);
			expect(result.envExampleKeys).toEqual(result.contractKeys);
			expect(result.envExampleMetadata.OPENUI_TIMEOUT_MS).toMatchObject({
				defaultValue: "45000",
				sensitive: "false",
				hasValueLine: true,
			});
			expect(Array.isArray(result.readmeIssues)).toBe(true);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 15_000);

	it("fails when .env.example metadata drifts from env-contract", async () => {
		const { verifyEnvContract } = await import(
			"../tooling/verify-env-contract.mjs"
		);
		const tempRoot = await createTempEnvContractFixture({
			envExampleTransform: (envExampleRaw) =>
				envExampleRaw.replace(
					"Per-request model timeout in milliseconds.",
					"Drifted description",
				),
		});

		try {
			const result = await verifyEnvContract({ rootDir: tempRoot });
			expect(result.ok).toBe(false);
			expect(
				result.issues.some((issue: string) =>
					issue.includes(
						".env.example description mismatch for OPENUI_TIMEOUT_MS",
					),
				),
			).toBe(true);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("fails by default when env-governance section drifts from env-contract", async () => {
		const { verifyEnvContract } = await import(
			"../tooling/verify-env-contract.mjs"
		);
		const tempRoot = await createTempEnvContractFixture({
			docsTransform: (docsRaw) =>
				docsRaw.replace(
					"| `OPENUI_TIMEOUT_MS` | No | `45000` | Positive number. |",
					"| `OPENUI_TIMEOUT_MS` | No | `45000` | Positive number. |\n| `OPENUI_FAKE_DRIFT` | No | `0` | Drift. |",
				),
		});

		try {
			const result = await verifyEnvContract({ rootDir: tempRoot });

			expect(result.failOnReadmeDrift).toBe(true);
			expect(result.ok).toBe(false);
			expect(result.issues).toEqual([]);
			expect(result.readmeIssues.length).toBeGreaterThan(0);
			expect(
				result.blockingIssues.some((issue: string) =>
					issue.includes(
						"docs/environment-governance.md runtime variables section keys",
					),
				),
			).toBe(true);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("can downgrade env-doc drift to warning-only mode via parameter", async () => {
		const { verifyEnvContract } = await import(
			"../tooling/verify-env-contract.mjs"
		);
		const tempRoot = await createTempEnvContractFixture({
			docsTransform: (docsRaw) =>
				docsRaw.replace(
					"| `OPENUI_TIMEOUT_MS` | No | `45000` | Positive number. |",
					"| `OPENUI_TIMEOUT_MS` | No | `45000` | Positive number. |\n| `OPENUI_FAKE_DRIFT` | No | `0` | Drift. |",
				),
		});

		try {
			const result = await verifyEnvContract({
				rootDir: tempRoot,
				failOnReadmeDrift: false,
			});

			expect(result.failOnReadmeDrift).toBe(false);
			expect(result.ok).toBe(true);
			expect(result.issues).toEqual([]);
			expect(result.readmeIssues.length).toBeGreaterThan(0);
			expect(result.blockingIssues).toEqual([]);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("supports CLI flag to downgrade env-doc drift failures", async () => {
		const { runVerifyEnvContractCli } = await import(
			"../tooling/verify-env-contract.mjs"
		);
		const tempRoot = await createTempEnvContractFixture({
			docsTransform: (docsRaw) =>
				docsRaw.replace(
					"| `OPENUI_TIMEOUT_MS` | No | `45000` | Positive number. |",
					"| `OPENUI_TIMEOUT_MS` | No | `45000` | Positive number. |\n| `OPENUI_FAKE_DRIFT` | No | `0` | Drift. |",
				),
		});

		try {
			const strictStdout = createBufferWriter();
			const strictStderr = createBufferWriter();
			const strictExitCode = await runVerifyEnvContractCli({
				argv: [],
				verifyOptions: { rootDir: tempRoot },
				stdout: strictStdout.stream,
				stderr: strictStderr.stream,
			});

			expect(strictExitCode).toBe(1);
			expect(strictStderr.read()).toContain("ENV contract check failed.");
			expect(strictStderr.read()).toContain(
				"Migration hint: run with --allow-readme-drift",
			);

			const warningStdout = createBufferWriter();
			const warningStderr = createBufferWriter();
			const warningExitCode = await runVerifyEnvContractCli({
				argv: ["--allow-readme-drift"],
				verifyOptions: { rootDir: tempRoot },
				stdout: warningStdout.stream,
				stderr: warningStderr.stream,
			});

			expect(warningExitCode).toBe(0);
			expect(warningStderr.read()).toBe("");
			expect(warningStdout.read()).toContain(
				"ENV contract check passed with README warnings (non-blocking mode).",
			);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("fails when docs non-contract registry block drifts from deprecation registry", async () => {
		const { verifyEnvGovernance } = await import(
			"../tooling/verify-env-governance.mjs"
		);
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-env-governance-doc-drift-"),
		);

		try {
			await fs.mkdir(path.join(tempRoot, "services", "mcp-server", "src"), {
				recursive: true,
			});
			await fs.mkdir(path.join(tempRoot, "packages", "contracts", "src"), {
				recursive: true,
			});
			await fs.mkdir(path.join(tempRoot, "tooling", "env-contract"), {
				recursive: true,
			});
			await fs.mkdir(path.join(tempRoot, "docs"), { recursive: true });

			await Promise.all([
				fs.writeFile(
					path.join(
						tempRoot,
						"packages",
						"contracts",
						"src",
						"env-contract.ts",
					),
					`export const OPENUI_ENV_KEYS = ["OPENUI_TIMEOUT_MS"] as const;
export const OPENUI_ENV_CONTRACT = Object.freeze({
  OPENUI_TIMEOUT_MS: {
    defaultValue: 45000,
    sensitive: false,
    description: "Per-request model timeout in milliseconds.",
    validation: "Positive number.",
  },
});
`,
					"utf8",
				),
				fs.writeFile(
					path.join(tempRoot, ".env.example"),
					`# @env OPENUI_TIMEOUT_MS
# description: Per-request model timeout in milliseconds.
# default: 45000
# validation: Positive number.
# sensitive: false
OPENUI_TIMEOUT_MS=45000
`,
					"utf8",
				),
				fs.writeFile(
					path.join(tempRoot, "services", "mcp-server", "src", "runtime.ts"),
					"const queue = process.env.OPENUI_QUEUE_MAX_PENDING;\n",
					"utf8",
				),
				fs.writeFile(
					path.join(
						tempRoot,
						"tooling",
						"env-contract",
						"deprecation-registry.json",
					),
					JSON.stringify(
						{
							version: 1,
							nonContractKeys: [
								{
									key: "OPENUI_QUEUE_MAX_PENDING",
									reason: "Queue backpressure runtime knob.",
								},
							],
							deprecatedKeys: [],
							envExampleExceptions: [],
						},
						null,
						2,
					),
					"utf8",
				),
				fs.writeFile(
					path.join(tempRoot, "docs", "environment-governance.md"),
					`# Environment Governance
<!-- NON_CONTRACT_REGISTRY:START -->
- \`OPENUI_WRONG_KEY\` - drift
<!-- NON_CONTRACT_REGISTRY:END -->
`,
					"utf8",
				),
			]);

			const result = await verifyEnvGovernance({
				rootDir: tempRoot,
				currentDate: "2026-02-26",
			});
			expect(result.ok).toBe(false);
			expect(
				result.issues.some((issue: string) =>
					issue.includes("docs/environment-governance.md"),
				),
			).toBe(true);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("enforces shell > .env > default precedence", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-env-priority-"),
		);

		try {
			await fs.writeFile(
				path.join(tempRoot, ".env"),
				"GEMINI_MODEL=from-env\n",
				"utf8",
			);
			const withoutShell = await runModelWithEnvFiles({ cwd: tempRoot });
			expect(withoutShell).toBe("from-env");

			const withShell = await runModelWithEnvFiles({
				cwd: tempRoot,
				shellOverride: "from-shell",
			});
			expect(withShell).toBe("from-shell");

			await fs.writeFile(path.join(tempRoot, ".env"), "", "utf8");
			const fallbackDefault = await runModelWithEnvFiles({ cwd: tempRoot });
			expect(fallbackDefault).toBe("gemini-3.1-pro-preview");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 15_000);

	it("falls back GEMINI_MODEL_STRONG to GEMINI_MODEL when explicitly empty", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-env-strong-fallback-"),
		);

		try {
			await fs.writeFile(
				path.join(tempRoot, ".env"),
				"GEMINI_MODEL=from-env\nGEMINI_MODEL_STRONG=\n",
				"utf8",
			);
			const result = await runConstantExpr({
				cwd: tempRoot,
				expression: "constants.getGeminiModelStrong().model",
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("from-env");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("fails fast when numeric runtime env is NaN or <= 0", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-env-invalid-number-"),
		);

		try {
			const nanResult = await runConstantExpr({
				cwd: tempRoot,
				expression: "constants.getOpenuiTimeoutMs()",
				envOverrides: { OPENUI_TIMEOUT_MS: "NaN" },
			});
			expect(nanResult.exitCode).not.toBe(0);
			expect(nanResult.stderr).toContain("OPENUI_TIMEOUT_MS");

			const nonPositiveResult = await runConstantExpr({
				cwd: tempRoot,
				expression: "constants.getOpenuiRetryBaseMs()",
				envOverrides: { OPENUI_RETRY_BASE_MS: "0" },
			});
			expect(nonPositiveResult.exitCode).not.toBe(0);
			expect(nonPositiveResult.stderr).toContain("OPENUI_RETRY_BASE_MS");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 15_000);
});
