import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildEnvGovernanceRemediationMap,
	formatEnvGovernanceRemediationMap,
	resolveEnvGovernanceExecutionPlan,
	runVerifyEnvGovernanceCli,
	verifyEnvGovernance,
} from "../tooling/verify-env-governance.mjs";

async function createFixture(input = {}) {
	const rootDir = await fs.mkdtemp(
		path.join(os.tmpdir(), "openui-env-governance-"),
	);
	await fs.mkdir(path.join(rootDir, "services", "mcp-server", "src"), {
		recursive: true,
	});
	await fs.mkdir(path.join(rootDir, "packages", "contracts", "src"), {
		recursive: true,
	});
	await fs.mkdir(path.join(rootDir, "tooling", "env-contract"), {
		recursive: true,
	});
	await fs.mkdir(path.join(rootDir, "tests"), { recursive: true });
	await fs.mkdir(path.join(rootDir, "docs"), { recursive: true });

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

	const envExampleRaw =
		input.envExampleRaw ??
		`# @env OPENUI_TIMEOUT_MS
# description: Per-request model timeout in milliseconds.
# default: 45000
# validation: Positive number.
# sensitive: false
OPENUI_TIMEOUT_MS=45000
`;

	const runtimeRaw =
		input.runtimeRaw ??
		`const a = process.env.OPENUI_TIMEOUT_MS;\nconst b = process.env.OPENUI_QUEUE_MAX_PENDING;\n`;

	const registryRaw = input.registryRaw ?? {
		version: 1,
		nonContractKeys: [
			{
				key: "OPENUI_QUEUE_MAX_PENDING",
				reason: "Queue backpressure runtime knob.",
			},
		],
		deprecatedKeys: [],
		envExampleExceptions: [],
	};

	const writes = [
		fs.writeFile(
			path.join(rootDir, "packages", "contracts", "src", "env-contract.ts"),
			contractRaw,
			"utf8",
		),
		fs.writeFile(path.join(rootDir, ".env.example"), envExampleRaw, "utf8"),
		fs.writeFile(
			path.join(rootDir, "services", "mcp-server", "src", "runtime.ts"),
			runtimeRaw,
			"utf8",
		),
		fs.writeFile(
			path.join(rootDir, "docs", "environment-governance.md"),
			`<!-- NON_CONTRACT_REGISTRY:START -->
\`OPENUI_QUEUE_MAX_PENDING\`
<!-- NON_CONTRACT_REGISTRY:END -->
`,
			"utf8",
		),
		fs.writeFile(
			path.join(
				rootDir,
				"tooling",
				"env-contract",
				"deprecation-registry.json",
			),
			JSON.stringify(registryRaw, null, 2),
			"utf8",
		),
	];

	if (typeof input.envRaw === "string") {
		writes.push(fs.writeFile(path.join(rootDir, ".env"), input.envRaw, "utf8"));
	}
	if (typeof input.envLocalRaw === "string") {
		writes.push(
			fs.writeFile(path.join(rootDir, ".env.local"), input.envLocalRaw, "utf8"),
		);
	}
	if (typeof input.testRaw === "string") {
		writes.push(
			fs.writeFile(
				path.join(rootDir, "tests", "sample.test.ts"),
				input.testRaw,
				"utf8",
			),
		);
	}
	if (typeof input.historyRaw === "string") {
		writes.push(
			fs.writeFile(
				path.join(rootDir, "docs", "env-deprecation-history.md"),
				input.historyRaw,
				"utf8",
			),
		);
	}
	if (input.exampleFiles && typeof input.exampleFiles === "object") {
		for (const [fileName, content] of Object.entries(input.exampleFiles)) {
			writes.push(
				fs.writeFile(path.join(rootDir, fileName), String(content), "utf8"),
			);
		}
	}

	await Promise.all(writes);

	return rootDir;
}

function createBufferWriter() {
	let value = "";
	return {
		stream: {
			write(chunk: string | Uint8Array) {
				value += String(chunk);
				return true;
			},
		},
		read() {
			return value;
		},
	};
}

describe("env governance gate", () => {
	const permanentlyBannedGoogleApiKey = ["GOOGLE", "API", "KEY"].join("_");

	it("passes when runtime keys are registered and env example keys are contract-aligned", async () => {
		const rootDir = await createFixture();

		try {
			const result = await verifyEnvGovernance({
				rootDir,
				currentDate: "2026-01-01",
			});
			expect(result.ok).toBe(true);
			expect(result.issues).toEqual([]);
			expect(result.warnings).toEqual([]);
			expect(result.runtimeKeys).toEqual([
				"OPENUI_QUEUE_MAX_PENDING",
				"OPENUI_TIMEOUT_MS",
			]);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("rejects absolute contract path outside rootDir", async () => {
		const rootDir = await createFixture();
		const outsideDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-env-governance-outside-"),
		);
		const outsideContractPath = path.join(outsideDir, "env-contract.ts");

		await fs.writeFile(
			outsideContractPath,
			'export const OPENUI_ENV_KEYS = ["OPENUI_TIMEOUT_MS"] as const;\nexport const OPENUI_ENV_CONTRACT = Object.freeze({ OPENUI_TIMEOUT_MS: { defaultValue: 1, sensitive: false, description: "x", validation: "x" } });\n',
			"utf8",
		);

		try {
			await expect(
				verifyEnvGovernance({
					rootDir,
					contractPath: outsideContractPath,
					currentDate: "2026-01-01",
				}),
			).rejects.toThrow(/contractPath must resolve inside rootDir/);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
			await fs.rm(outsideDir, { recursive: true, force: true });
		}
	});

	it("fails on unregistered runtime key, incomplete deprecation metadata, and env example drift", async () => {
		const rootDir = await createFixture({
			runtimeRaw: "const x = process.env.OPENUI_UNTRACKED;\n",
			envExampleRaw: `# @env OPENUI_TIMEOUT_MS
# description: Per-request model timeout in milliseconds.
# default: 45000
# validation: Positive number.
# sensitive: false
OPENUI_TIMEOUT_MS=45000

# @env OPENUI_EXTRA
# description: drift
# default: 1
# validation: Positive number.
# sensitive: false
OPENUI_EXTRA=1
`,
			registryRaw: {
				version: 1,
				nonContractKeys: [],
				deprecatedKeys: [
					{
						key: "OPENUI_LEGACY_SAMPLE_KEY",
						replacement: "GEMINI_API_KEY",
					},
				],
				envExampleExceptions: [],
			},
		});

		try {
			const result = await verifyEnvGovernance({
				rootDir,
				currentDate: "2026-01-01",
			});
			expect(result.ok).toBe(false);
			expect(
				result.issues.some((issue) => issue.includes("OPENUI_UNTRACKED")),
			).toBe(true);
			expect(
				result.issues.some((issue) => issue.includes("migrationHint")),
			).toBe(true);
			expect(result.issues.some((issue) => issue.includes("sunsetAfter"))).toBe(
				true,
			);
			expect(
				result.issues.some((issue) => issue.includes("OPENUI_EXTRA")),
			).toBe(true);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("blocks deprecated keys declared in registry", async () => {
		const rootDir = await createFixture({
			registryRaw: {
				version: 1,
				nonContractKeys: [
					{
						key: "OPENUI_QUEUE_MAX_PENDING",
						reason: "Queue backpressure runtime knob.",
					},
				],
				deprecatedKeys: [
					{
						key: "OPENUI_LEGACY_SAMPLE_KEY",
						replacement: "GEMINI_API_KEY",
						migrationHint: "Use GEMINI_API_KEY from .env or shell/CI.",
						sunsetAfter: "2026-12-31",
					},
				],
				envExampleExceptions: [],
			},
		});
		const stdout = createBufferWriter();
		const stderr = createBufferWriter();

		try {
			const exitCode = await runVerifyEnvGovernanceCli({
				argv: ["--ci"],
				verifyOptions: {
					rootDir,
					currentDate: "2026-01-01",
				},
				stdout: stdout.stream,
				stderr: stderr.stream,
			});

			expect(exitCode).toBe(1);
			expect(stderr.read()).toContain("ENV governance check failed.");
			expect(stderr.read()).toContain(
				"Deprecated key OPENUI_LEGACY_SAMPLE_KEY is forbidden",
			);
			expect(stderr.read()).toContain("hard-fail");
			expect(stderr.read()).toContain(
				"[env-governance] remediation map (key -> action):",
			);
			expect(stderr.read()).toContain("OPENUI_LEGACY_SAMPLE_KEY ->");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("builds remediation mapping from key-governance issues", () => {
		const remediations = buildEnvGovernanceRemediationMap([
			"- Unregistered runtime env key OPENUI_NEW_FLAG: add it to packages/contracts/src/env-contract.ts or tooling/env-contract/deprecation-registry.json (nonContractKeys/ciOnlyKeys/testOnlyKeys).",
			"- .env.example key OPENUI_NEW_FLAG must exist in contract keys or envExampleExceptions.",
			"- Permanently banned env key LEGACY_VENDOR_API_KEY referenced in src/runtime.ts:2.",
		]);
		const lines = formatEnvGovernanceRemediationMap(remediations);

		expect(remediations.map((entry) => entry.key)).toEqual([
			"LEGACY_VENDOR_API_KEY",
			"OPENUI_NEW_FLAG",
		]);
		expect(lines[0]).toContain("remediation map");
		expect(
			lines.some((line) => line.includes("LEGACY_VENDOR_API_KEY ->")),
		).toBe(true);
		expect(
			lines.some(
				(line) =>
					line.includes("OPENUI_NEW_FLAG ->") &&
					line.includes("packages/contracts/src/env-contract.ts"),
			),
		).toBe(true);
	});

	it("does not emit warning/deprecated notice lines in staged mode", async () => {
		const rootDir = await createFixture();
		const stdout = createBufferWriter();
		const stderr = createBufferWriter();

		try {
			const exitCode = await runVerifyEnvGovernanceCli({
				argv: ["--staged"],
				stagedFiles: ["packages/contracts/src/env-contract.ts"],
				getStagedDiff: () => "",
				verifyOptions: {
					rootDir,
					currentDate: "2026-01-01",
				},
				stdout: stdout.stream,
				stderr: stderr.stream,
			});

			expect(exitCode).toBe(0);
			expect(stderr.read()).toBe("");
			expect(stdout.read()).toContain("ENV governance check passed");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("blocks when deprecated keys appear in env files", async () => {
		const rootDir = await createFixture({
			registryRaw: {
				version: 1,
				nonContractKeys: [
					{
						key: "OPENUI_QUEUE_MAX_PENDING",
						reason: "Queue backpressure runtime knob.",
					},
				],
				deprecatedKeys: [
					{
						key: "OPENUI_LEGACY_SAMPLE_KEY",
						replacement: "GEMINI_API_KEY",
						migrationHint: "Use GEMINI_API_KEY from .env or shell/CI.",
						sunsetAfter: "2026-12-31",
					},
					{
						key: "OPENUI_LEGACY_RETRY_ATTEMPTS",
						replacement: "LIVE_TEST_MAX_RETRIES",
						migrationHint:
							"Use LIVE_TEST_MAX_RETRIES instead (attempts = retries + 1).",
						sunsetAfter: "2026-12-31",
					},
				],
				envExampleExceptions: [],
			},
			envRaw: "OPENUI_LEGACY_SAMPLE_KEY=deprecated-local-key\n", // pragma: allowlist secret
			exampleFiles: {
				".env.staging.example": "OPENUI_LEGACY_RETRY_ATTEMPTS=4\n",
			},
		});

		try {
			const result = await verifyEnvGovernance({
				rootDir,
				currentDate: "2026-01-01",
			});
			expect(result.ok).toBe(false);
			expect(
				result.issues.some((issue) =>
					issue.includes(
						"Deprecated key OPENUI_LEGACY_SAMPLE_KEY found in .env",
					),
				),
			).toBe(true);
			expect(
				result.issues.some((issue) =>
					issue.includes(
						"Deprecated key OPENUI_LEGACY_RETRY_ATTEMPTS found in .env.staging.example",
					),
				),
			).toBe(true);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails when permanently banned keys are referenced in source code", async () => {
		const rootDir = await createFixture({
			runtimeRaw: `const x = process.env.OPENUI_TIMEOUT_MS;\nconst y = process.env.${permanentlyBannedGoogleApiKey};\n`,
		});

		try {
			const result = await verifyEnvGovernance({
				rootDir,
				currentDate: "2026-01-01",
			});
			expect(result.ok).toBe(false);
			expect(
				result.issues.some((issue) =>
					issue.includes(
						`Permanently banned env key ${permanentlyBannedGoogleApiKey} referenced in services/mcp-server/src/runtime.ts:2`,
					),
				),
			).toBe(true);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("allows negative-assertion anti-regression tests for permanently banned keys", async () => {
		const rootDir = await createFixture({
			testRaw: `import { expect, it } from "vitest";\nit("guards regression", () => {\n  const key = ["GOOGLE", "API", "KEY"].join("_");\n  expect("runtime").not.toContain(key);\n});\n`,
		});

		try {
			const result = await verifyEnvGovernance({
				rootDir,
				currentDate: "2026-01-01",
			});
			expect(result.ok).toBe(true);
			expect(result.issues).toEqual([]);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("blocks env deprecation history doc when plaintext banned keys are present", async () => {
		const rootDir = await createFixture({
			historyRaw: `Deprecated mapping: ${permanentlyBannedGoogleApiKey} -> GEMINI_API_KEY.\n`,
		});

		try {
			const result = await verifyEnvGovernance({
				rootDir,
				currentDate: "2026-01-01",
			});
			expect(result.ok).toBe(false);
			expect(
				result.issues.some((issue) =>
					issue.includes(
						`Permanently banned env key ${permanentlyBannedGoogleApiKey} referenced in docs/env-deprecation-history.md:1`,
					),
				),
			).toBe(true);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("skips staged mode fast when staged changes are unrelated", () => {
		const plan = resolveEnvGovernanceExecutionPlan({
			mode: "staged",
			isCi: false,
			stagedFiles: ["README.md", "services/mcp-server/src/tools/generate.ts"],
			getStagedDiff: () => "export function generate() { return 1; }\n",
		});

		expect(plan.shouldRun).toBe(false);
		expect(plan.reason).toContain("no env-related staged changes");
	});

	it("enforces staged check when env-related files are changed", () => {
		const plan = resolveEnvGovernanceExecutionPlan({
			mode: "staged",
			isCi: false,
			stagedFiles: ["packages/contracts/src/env-contract.ts"],
			getStagedDiff: () => "",
		});

		expect(plan.shouldRun).toBe(true);
		expect(plan.reason).toContain("env-related staged changes detected");
		expect(plan.matchedFiles).toEqual([
			"packages/contracts/src/env-contract.ts",
		]);
	});

	it("keeps ci mode strict even without staged files", () => {
		const plan = resolveEnvGovernanceExecutionPlan({
			mode: "staged",
			isCi: true,
			stagedFiles: [],
			getStagedDiff: () => "",
		});

		expect(plan.shouldRun).toBe(true);
		expect(plan.reason).toContain("ci mode");
	});
});
