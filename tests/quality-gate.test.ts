import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runQualityGate } from "../services/mcp-server/src/quality-gate.js";

const tempDirs: string[] = [];
const ORIGINAL_CHILD_ALLOWLIST = process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST;
const ORIGINAL_TEST_ONLY_ALLOWED = process.env.TEST_ONLY_ALLOWED;
const ORIGINAL_TEST_ONLY_UNRELATED_SECRET =
	process.env.TEST_ONLY_UNRELATED_SECRET;

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function makeScript(markerFile: string, exitCode = 0): string {
	return `node -e "require('node:fs').writeFileSync('${markerFile}','done');process.exit(${exitCode})"`;
}

function makeEnvDumpScript(outputFile: string): string {
	return `node -e "require('node:fs').writeFileSync('${outputFile}', JSON.stringify({ path: process.env.PATH || null, allowed: process.env.TEST_ONLY_ALLOWED || null, blocked: process.env.TEST_ONLY_UNRELATED_SECRET || null }));"`;
}

afterEach(async () => {
	if (ORIGINAL_CHILD_ALLOWLIST === undefined) {
		delete process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST;
	} else {
		process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST = ORIGINAL_CHILD_ALLOWLIST;
	}
	if (ORIGINAL_TEST_ONLY_ALLOWED === undefined) {
		delete process.env.TEST_ONLY_ALLOWED;
	} else {
		process.env.TEST_ONLY_ALLOWED = ORIGINAL_TEST_ONLY_ALLOWED;
	}
	if (ORIGINAL_TEST_ONLY_UNRELATED_SECRET === undefined) {
		delete process.env.TEST_ONLY_UNRELATED_SECRET;
	} else {
		process.env.TEST_ONLY_UNRELATED_SECRET =
			ORIGINAL_TEST_ONLY_UNRELATED_SECRET;
	}
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("runQualityGate preset execution", () => {
	it("rejects summary-file paths that escape ci-gate runtime directory", () => {
		const scriptPath = path.resolve(process.cwd(), "tooling/ci-gate.mjs");
		const result = spawnSync(
			process.execPath,
			[scriptPath, "--summary-file=../escape.json"],
			{
				cwd: process.cwd(),
				encoding: "utf8",
			},
		);

		expect(result.status).toBe(2);
		expect(result.stderr).toContain(
			"--summary-file must target .runtime-cache/runs/<run_id>/summary.json",
		);
	});

	it("rejects absolute filePaths outside targetRoot", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		const outsideDir = await mkTempDir("openui-quality-gate-outside-");
		const outsideFile = path.join(outsideDir, "outside.tsx");
		await fs.writeFile(
			outsideFile,
			"export default function Outside(){return null}",
			"utf8",
		);

		await expect(
			runQualityGate({
				targetRoot: root,
				filePaths: [outsideFile],
			}),
		).rejects.toThrow(/must be relative to targetRoot/i);
	});

	it("rejects traversal filePaths that escape targetRoot", async () => {
		const root = await mkTempDir("openui-quality-gate-");

		await expect(
			runQualityGate({
				targetRoot: root,
				filePaths: ["../outside.tsx"],
			}),
		).rejects.toThrow(/cannot escape targetRoot/i);
	});

	it("rejects filePaths that point to directories instead of files", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		await fs.mkdir(path.join(root, "app"), { recursive: true });

		await expect(
			runQualityGate({
				targetRoot: root,
				filePaths: ["app"],
			}),
		).rejects.toThrow(/must reference files/i);
	});

	it("rejects symlink filePaths even if lexical path is inside targetRoot", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		const outsideDir = await mkTempDir("openui-quality-gate-outside-");
		const outsideFile = path.join(outsideDir, "outside.tsx");
		await fs.writeFile(
			outsideFile,
			"export default function Outside(){return null}",
			"utf8",
		);
		await fs.symlink(outsideFile, path.join(root, "inside-link.tsx"));

		await expect(
			runQualityGate({
				targetRoot: root,
				filePaths: ["inside-link.tsx"],
			}),
		).rejects.toThrow(/symlink/i);
	});

	it("rejects shell-metacharacter command injection via deprecated fields in strict mode", async () => {
		const root = await mkTempDir("openui-quality-gate-");

		await expect(
			runQualityGate({
				targetRoot: root,
				runCommands: true,
				preset: "lint",
				mode: "strict",
				lintCommand: "npm run lint && touch injected",
				files: [
					{
						path: "app/page.tsx",
						content:
							'export default function Page(){return <main className="p-4">dashboard</main>}',
					},
				],
			}),
		).rejects.toThrow(/shell metacharacters/i);
	});

	it("executes ci_gate preset through whitelist npm scripts", async () => {
		const root = await mkTempDir("openui-quality-gate-");

		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify(
				{
					name: "openui-quality-gate-test",
					version: "1.0.0",
					private: true,
					scripts: {
						lint: makeScript("lint.marker"),
						typecheck: makeScript("typecheck.marker"),
						test: makeScript("test.marker"),
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = await runQualityGate({
			targetRoot: root,
			runCommands: true,
			preset: "ci_gate",
			mode: "strict",
			commandTimeoutMs: 10_000,
			files: [
				{
					path: "app/page.tsx",
					content:
						'export default function Page(){return <main className="p-4">dashboard</main>}',
				},
			],
		});

		await Promise.all(
			["lint.marker", "typecheck.marker", "test.marker"].map(async (file) => {
				await expect(fs.access(path.join(root, file))).resolves.toBeUndefined();
				await expect(fs.readFile(path.join(root, file), "utf8")).resolves.toBe(
					"done",
				);
			}),
		);

		expect(result.commandResults.map((item) => item.command)).toEqual([
			"npm run lint",
			"npm run typecheck",
			"npm run test",
		]);
		expect(result.commandResults.map((item) => item.exitCode)).toEqual([
			0, 0, 0,
		]);
		expect(result.issues).toEqual([]);
		expect(
			result.commandResults.every((item) => item.status === "passed"),
		).toBe(true);
		expect(result.passed).toBe(true);
	}, 15_000);

	it("passes allowlisted env to npm script commands", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		const envDumpFile = "env-dump.json";
		const originalAllowlist = process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST;
		const originalAllowed = process.env.TEST_ONLY_ALLOWED;
		const originalBlocked = process.env.TEST_ONLY_UNRELATED_SECRET;

		process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST = "TEST_ONLY_ALLOWED";
		process.env.TEST_ONLY_ALLOWED = "allowed";
		process.env.TEST_ONLY_UNRELATED_SECRET = "blocked";

		try {
			await fs.writeFile(
				path.join(root, "package.json"),
				JSON.stringify(
					{
						name: "openui-quality-gate-env-test",
						version: "1.0.0",
						private: true,
						scripts: {
							lint: makeEnvDumpScript(envDumpFile),
						},
					},
					null,
					2,
				),
				"utf8",
			);

			const result = await runQualityGate({
				targetRoot: root,
				runCommands: true,
				preset: "lint",
				mode: "strict",
				commandTimeoutMs: 5_000,
				files: [
					{
						path: "app/page.tsx",
						content:
							'export default function Page(){return <main className="p-4">dashboard</main>}',
					},
				],
			});

			const envDumpRaw = await fs.readFile(
				path.join(root, envDumpFile),
				"utf8",
			);
			const envDump = JSON.parse(envDumpRaw) as {
				path: string | null;
				allowed: string | null;
				blocked: string | null;
			};

			expect(result.passed).toBe(true);
			expect(typeof envDump.path).toBe("string");
			expect((envDump.path ?? "").length).toBeGreaterThan(0);
			expect(envDump.allowed).toBe("allowed");
			expect(envDump.blocked).toBeNull();
		} finally {
			if (originalAllowlist === undefined) {
				delete process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST;
			} else {
				process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST = originalAllowlist;
			}
			if (originalAllowed === undefined) {
				delete process.env.TEST_ONLY_ALLOWED;
			} else {
				process.env.TEST_ONLY_ALLOWED = originalAllowed;
			}
			if (originalBlocked === undefined) {
				delete process.env.TEST_ONLY_UNRELATED_SECRET;
			} else {
				process.env.TEST_ONLY_UNRELATED_SECRET = originalBlocked;
			}
		}
	}, 30_000);

	it("fails in strict mode when preset scripts are missing", async () => {
		const root = await mkTempDir("openui-quality-gate-");

		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify(
				{
					name: "openui-quality-gate-missing-scripts",
					version: "1.0.0",
					private: true,
					scripts: {
						lint: makeScript("lint.marker"),
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = await runQualityGate({
			targetRoot: root,
			runCommands: true,
			preset: "ci_gate",
			mode: "strict",
			files: [
				{
					path: "app/page.tsx",
					content:
						'export default function Page(){return <main className="p-4">dashboard</main>}',
				},
			],
		});

		expect(result.passed).toBe(false);
		expect(result.commandResults.map((item) => item.status)).toEqual([
			"passed",
			"skipped",
			"skipped",
		]);
		expect(result.commandResults.map((item) => item.exitCode)).toEqual([
			0,
			null,
			null,
		]);
		expect(result.issues.some((issue) => issue.rule === "command_failed")).toBe(
			false,
		);
		const missingScriptIssues = result.issues.filter(
			(issue) => issue.rule === "command_skipped_missing_script",
		);
		expect(missingScriptIssues).toHaveLength(2);
		expect(
			missingScriptIssues.every((issue) => issue.severity === "error"),
		).toBe(true);
	});

	it("keeps command failure severity when script exists but execution fails", async () => {
		const root = await mkTempDir("openui-quality-gate-");

		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify(
				{
					name: "openui-quality-gate-command-failure",
					version: "1.0.0",
					private: true,
					scripts: {
						lint: makeScript("lint.marker", 2),
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = await runQualityGate({
			targetRoot: root,
			runCommands: true,
			preset: "lint",
			mode: "strict",
			files: [
				{
					path: "app/page.tsx",
					content:
						'export default function Page(){return <main className="p-4">dashboard</main>}',
				},
			],
		});

		expect(result.passed).toBe(false);
		expect(result.commandResults).toHaveLength(1);
		expect(result.commandResults[0]?.status).toBe("failed");
		expect(result.commandResults[0]?.exitCode).toBe(2);
		expect(
			result.issues.some(
				(issue) =>
					issue.rule === "command_failed" && issue.severity === "error",
			),
		).toBe(true);
	});

	it("fails in strict mode when package command matrix is degraded", async () => {
		const root = await mkTempDir("openui-quality-gate-");

		const result = await runQualityGate({
			targetRoot: root,
			runCommands: true,
			preset: "lint",
			mode: "strict",
			files: [
				{
					path: "app/page.tsx",
					content:
						'export default function Page(){return <main className="p-4">dashboard</main>}',
				},
			],
		});

		expect(result.passed).toBe(false);
		expect(
			result.issues.some(
				(issue) =>
					issue.rule === "command_matrix_degraded" &&
					issue.severity === "error",
			),
		).toBe(true);
	});

	it("downgrades missing script issues to warnings in advisory mode", async () => {
		const root = await mkTempDir("openui-quality-gate-");

		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify(
				{
					name: "openui-quality-gate-advisory",
					version: "1.0.0",
					private: true,
					scripts: {
						lint: makeScript("lint.marker"),
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = await runQualityGate({
			targetRoot: root,
			runCommands: true,
			preset: "ci_gate",
			mode: "advisory",
			files: [
				{
					path: "app/page.tsx",
					content:
						'export default function Page(){return <main className="p-4">dashboard</main>}',
				},
			],
		});

		expect(result.passed).toBe(true);
		expect(result.commandResults.map((item) => item.status)).toEqual([
			"passed",
			"skipped",
			"skipped",
		]);
		const missingScriptIssues = result.issues.filter(
			(issue) => issue.rule === "command_skipped_missing_script",
		);
		expect(missingScriptIssues).toHaveLength(2);
		expect(
			missingScriptIssues.every((issue) => issue.severity === "warn"),
		).toBe(true);
		expect(result.issues.some((issue) => issue.severity === "error")).toBe(
			false,
		);
	});

	it("records timeout issue when command exceeds timeout", async () => {
		const root = await mkTempDir("openui-quality-gate-");

		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify(
				{
					name: "openui-quality-gate-timeout",
					version: "1.0.0",
					private: true,
					scripts: {
						lint: 'node -e "setInterval(() => {}, 1000)"',
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = await runQualityGate({
			targetRoot: root,
			runCommands: true,
			preset: "lint",
			mode: "strict",
			commandTimeoutMs: 50,
			files: [
				{
					path: "app/page.tsx",
					content:
						'export default function Page(){return <main className="p-4">dashboard</main>}',
				},
			],
		});

		expect(result.passed).toBe(false);
		expect(result.commandResults).toHaveLength(1);
		expect(result.commandResults[0]?.status).toBe("failed");
		expect(result.commandResults[0]?.reason).toBe("timeout");
		expect(
			result.issues.some(
				(issue) =>
					issue.rule === "command_timeout" && issue.severity === "error",
			),
		).toBe(true);
	});

	it("loads valid filePaths and reports lint style warnings", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		const filePath = path.join(root, "app/page.tsx");
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		const largeBody = new Array(451).fill("line").join("\n");
		await fs.writeFile(
			filePath,
			`import { Button } from "components/ui/button";\n<div style="color:red">x</div>\nconst tone="#fff";\nconst accent="rgba(0,0,0,0.2)";\n${largeBody}`,
			"utf8",
		);

		const result = await runQualityGate({
			targetRoot: root,
			filePaths: ["app/page.tsx"],
			uiuxScore: 79,
		});

		expect(result.checkedFiles).toEqual(["app/page.tsx"]);
		expect(result.issues.map((item) => item.rule)).toEqual(
			expect.arrayContaining([
				"no_inline_style",
				"no_hardcoded_hex_color",
				"no_hardcoded_color_function",
				"expect_tailwind_classname",
				"prefer_alias_import_for_shadcn",
				"large_file",
				"uiux_score_below_threshold",
			]),
		);
	});

	it("requires cva for shadcn primitive files", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		const filePath = path.join(root, "components/ui/button.tsx");
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(
			filePath,
			'export function Button(){return <button className="inline-flex">Run</button>}',
			"utf8",
		);

		const result = await runQualityGate({
			targetRoot: root,
			filePaths: ["components/ui/button.tsx"],
		});

		expect(
			result.issues.some(
				(issue) =>
					issue.rule === "require_cva_for_shadcn_primitive" &&
					issue.severity === "error",
			),
		).toBe(true);
	});

	it("handles unreadable package json and advisory preset defaults", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		await fs.writeFile(path.join(root, "package.json"), "{", "utf8");

		const result = await runQualityGate({
			targetRoot: root,
			files: [{ path: "app/page.tsx", content: "<main className='x'/>" }],
			runCommands: true,
			mode: "advisory",
		});

		expect(result.commandResults[0]?.command).toBe("npm run lint");
		expect(result.commandResults[0]?.status).toBe("skipped");
		expect(
			result.issues.some(
				(issue) =>
					issue.rule === "command_matrix_degraded" && issue.severity === "warn",
			),
		).toBe(true);
	});

	it("validates uiux score/threshold range and timeout values", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		const files = [{ path: "app/page.tsx", content: "<main className='x'/>" }];

		const zeroBoundary = await runQualityGate({
			targetRoot: root,
			files,
			uiuxScore: 0,
			uiuxThreshold: 0,
		});
		expect(
			zeroBoundary.issues.some(
				(issue) => issue.rule === "uiux_score_below_threshold",
			),
		).toBe(false);

		const upperBoundary = await runQualityGate({
			targetRoot: root,
			files,
			uiuxScore: 100,
			uiuxThreshold: 100,
		});
		expect(
			upperBoundary.issues.some(
				(issue) => issue.rule === "uiux_score_below_threshold",
			),
		).toBe(false);

		await expect(
			runQualityGate({
				targetRoot: root,
				files,
				uiuxScore: 101,
			}),
		).rejects.toThrow(/uiuxScore must be a finite number between 0 and 100/);

		await expect(
			runQualityGate({
				targetRoot: root,
				files,
				uiuxScore: Number.POSITIVE_INFINITY,
			}),
		).rejects.toThrow(/uiuxScore must be a finite number/);

		await expect(
			runQualityGate({
				targetRoot: root,
				files,
				uiuxScore: -1,
			}),
		).rejects.toThrow(/uiuxScore must be a finite number between 0 and 100/);

		await expect(
			runQualityGate({
				targetRoot: root,
				files,
				uiuxThreshold: 101,
			}),
		).rejects.toThrow(
			/uiuxThreshold must be a finite number between 0 and 100/,
		);

		await expect(
			runQualityGate({
				targetRoot: root,
				files,
				uiuxThreshold: -1,
			}),
		).rejects.toThrow(
			/uiuxThreshold must be a finite number between 0 and 100/,
		);

		await expect(
			runQualityGate({
				targetRoot: root,
				files,
				runCommands: true,
				preset: "lint",
				commandTimeoutMs: 0,
			}),
		).rejects.toThrow(/commandTimeoutMs must be a finite number/);
	});

	it("rejects filePaths that resolve outside root via symlinked parent directory", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		const outside = await mkTempDir("openui-quality-gate-outside-");
		await fs.writeFile(
			path.join(outside, "outside.tsx"),
			"export default 1;",
			"utf8",
		);
		await fs.symlink(outside, path.join(root, "linked"));

		await expect(
			runQualityGate({
				targetRoot: root,
				filePaths: ["linked/outside.tsx"],
			}),
		).rejects.toThrow(/resolve outside targetRoot/i);
	});

	it("reads filePaths from validated realpath when traversing a symlinked parent directory", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		const realDir = path.join(root, "real");
		const linkedDir = path.join(root, "linked");
		const linkedFile = path.join(linkedDir, "page.tsx");
		const expectedRealFile = path.join(realDir, "page.tsx");
		await fs.mkdir(realDir, { recursive: true });
		await fs.writeFile(
			expectedRealFile,
			'export default function Page(){return <main className="p-4">ok</main>;}',
			"utf8",
		);
		await fs.symlink(realDir, linkedDir);

		const readArgs: string[] = [];
		const originalReadFile = fs.readFile.bind(fs);
		const readSpy = vi
			.spyOn(fs, "readFile")
			.mockImplementation(async (file, options) => {
				readArgs.push(String(file));
				return originalReadFile(file, options as never);
			});

		try {
			const result = await runQualityGate({
				targetRoot: root,
				filePaths: ["linked/page.tsx"],
			});

			expect(result.checkedFiles).toEqual(["linked/page.tsx"]);
			expect(readArgs).toContain(await fs.realpath(expectedRealFile));
			expect(readArgs).not.toContain(linkedFile);
		} finally {
			readSpy.mockRestore();
		}
	});

	it("ignores non-string and empty scripts in package.json script matrix", async () => {
		const root = await mkTempDir("openui-quality-gate-");
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify(
				{
					name: "openui-quality-gate-script-matrix",
					version: "1.0.0",
					private: true,
					scripts: {
						lint: 'node -e "process.exit(0)"',
						typecheck: "",
						test: 123,
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = await runQualityGate({
			targetRoot: root,
			files: [{ path: "app/page.tsx", content: "<main className='x'/>" }],
			preset: "ci_gate",
			mode: "advisory",
		});

		expect(result.commandResults.map((item) => item.status)).toEqual([
			"passed",
			"skipped",
			"skipped",
		]);
	});

	it("accepts deprecated commands without metacharacters and records warn issue", async () => {
		const root = await mkTempDir("openui-quality-gate-");

		const result = await runQualityGate({
			targetRoot: root,
			files: [{ path: "app/page.tsx", content: "<main className='x'/>" }],
			mode: "strict",
			lintCommand: "npm run lint",
		});

		expect(
			result.issues.some(
				(issue) =>
					issue.rule === "deprecated_command_ignored" &&
					issue.severity === "warn",
			),
		).toBe(true);
	});

	it("builds and evaluates acceptance pack when acceptance criteria are provided", async () => {
		const root = await mkTempDir("openui-quality-acceptance-");
		await fs.mkdir(path.join(root, "components", "ui"), { recursive: true });
		await fs.writeFile(
			path.join(root, "components.json"),
			JSON.stringify({
				aliases: {
					ui: "@/components/ui",
					components: "@/components",
				},
			}),
		);
		await fs.writeFile(
			path.join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: {
						"@/*": ["./*"],
					},
				},
			}),
		);

		const result = await runQualityGate({
			targetRoot: root,
			files: [
				{
					path: "app/page.tsx",
					content:
						'export default function Page(){return <main className="p-6">Pricing</main>}',
				},
			],
			acceptanceCriteria: ["Headline should mention pricing."],
			a11yRequirements: ["Focus state should be visible."],
			smokePassed: true,
		});

		expect(result.acceptancePack?.version).toBe(1);
		expect(result.acceptancePack?.criteria.map((item) => item.kind)).toEqual(
			expect.arrayContaining(["quality_gate", "manual_review", "a11y"]),
		);
		expect(result.acceptanceEvaluation?.version).toBe(1);
		expect(result.acceptanceEvaluation?.passed).toBe(false);
		expect(result.acceptanceEvaluation?.verdict).toBe("manual_review_required");
		expect(result.acceptanceEvaluation?.summary).toEqual({
			total: 3,
			autoPassed: 1,
			autoFailed: 0,
			manualRequired: 2,
			notRun: 0,
			blocked: 0,
		});
	});
});
