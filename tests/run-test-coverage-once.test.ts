import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(
	process.cwd(),
	"tooling/run-test-coverage-once.mjs",
);

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

async function createFakeNpmBin(binDir: string): Promise<void> {
	const fakeNpmPath = path.join(binDir, "npm");
	const script = `#!/bin/sh
if [ -n "$FAKE_NPM_COUNT_FILE" ]; then
  if [ -f "$FAKE_NPM_COUNT_FILE" ]; then
    current=$(cat "$FAKE_NPM_COUNT_FILE")
  else
    current=0
  fi
  next=$((current + 1))
  echo "$next" > "$FAKE_NPM_COUNT_FILE"
fi
if [ -n "$FAKE_NPM_DELAY_SECONDS" ]; then
  sleep "$FAKE_NPM_DELAY_SECONDS"
fi
exit "\${FAKE_NPM_EXIT_CODE:-0}"
`;
	await fs.writeFile(fakeNpmPath, script, { encoding: "utf8", mode: 0o755 });
}

async function runCoverageOnce(input: {
	cwd: string;
	args?: string[];
	env?: NodeJS.ProcessEnv;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	return await new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			[SCRIPT_PATH, ...(input.args ?? [])],
			{
				cwd: input.cwd,
				env: {
					...process.env,
					...input.env,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("close", (code) => {
			resolve({
				exitCode: typeof code === "number" ? code : 1,
				stdout,
				stderr,
			});
		});
	});
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("run-test-coverage-once", () => {
	it("propagates non-zero exit code in required mode", async () => {
		const cwd = await mkTempDir("openui-run-test-coverage-required-");
		const binDir = path.join(cwd, "bin");
		await fs.mkdir(binDir, { recursive: true });
		await createFakeNpmBin(binDir);
		const countFile = path.join(cwd, "count.txt");

		const result = await runCoverageOnce({
			cwd,
			env: {
				PATH: `${binDir}:${process.env.PATH ?? ""}`,
				FAKE_NPM_COUNT_FILE: countFile,
				FAKE_NPM_EXIT_CODE: "7",
			},
		});

		expect(result.exitCode).toBe(7);
		const count = await fs.readFile(countFile, "utf8");
		expect(Number(count.trim())).toBe(1);
	});

	it("returns zero in advisory mode when coverage command fails", async () => {
		const cwd = await mkTempDir("openui-run-test-coverage-advisory-");
		const binDir = path.join(cwd, "bin");
		await fs.mkdir(binDir, { recursive: true });
		await createFakeNpmBin(binDir);
		const countFile = path.join(cwd, "count.txt");

		const result = await runCoverageOnce({
			cwd,
			args: ["--mode=advisory"],
			env: {
				PATH: `${binDir}:${process.env.PATH ?? ""}`,
				FAKE_NPM_COUNT_FILE: countFile,
				FAKE_NPM_EXIT_CODE: "5",
			},
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toContain("[ci:gate][advisory]");
		const count = await fs.readFile(countFile, "utf8");
		expect(Number(count.trim())).toBe(1);
	});

	it("runs test:coverage only once across parallel invocations sharing the same run key", async () => {
		const cwd = await mkTempDir("openui-run-test-coverage-shared-");
		const binDir = path.join(cwd, "bin");
		await fs.mkdir(binDir, { recursive: true });
		await createFakeNpmBin(binDir);
		const countFile = path.join(cwd, "count.txt");

		const env = {
			PATH: `${binDir}:${process.env.PATH ?? ""}`,
			FAKE_NPM_COUNT_FILE: countFile,
			FAKE_NPM_DELAY_SECONDS: "1",
			FAKE_NPM_EXIT_CODE: "0",
			OPENUI_CI_GATE_RUN_KEY: "shared-run-key",
		};

		const [first, second] = await Promise.all([
			runCoverageOnce({ cwd, env }),
			runCoverageOnce({ cwd, env }),
		]);

		expect(first.exitCode).toBe(0);
		expect(second.exitCode).toBe(0);
		const count = await fs.readFile(countFile, "utf8");
		expect(Number(count.trim())).toBe(1);
		await expect(
			fs.access(
				path.join(
					cwd,
					".runtime-cache",
					"runs",
					"shared-run-key",
					"meta",
					"test-coverage-shared-run-key.json",
				),
			),
		).resolves.toBeUndefined();
		await expect(
			fs.access(
				path.join(
					cwd,
					".runtime-cache",
					"ci-gate",
					"test-coverage-shared-run-key.json",
				),
			),
		).rejects.toThrow();
	});

	it("reuses cached coverage result for sequential required/advisory calls", async () => {
		const cwd = await mkTempDir("openui-run-test-coverage-sequential-");
		const binDir = path.join(cwd, "bin");
		await fs.mkdir(binDir, { recursive: true });
		await createFakeNpmBin(binDir);
		const countFile = path.join(cwd, "count.txt");

		const env = {
			PATH: `${binDir}:${process.env.PATH ?? ""}`,
			FAKE_NPM_COUNT_FILE: countFile,
			FAKE_NPM_EXIT_CODE: "0",
			OPENUI_CI_GATE_RUN_KEY: "shared-run-key",
		};

		const first = await runCoverageOnce({ cwd, env });
		const second = await runCoverageOnce({
			cwd,
			args: ["--mode=advisory"],
			env,
		});

		expect(first.exitCode).toBe(0);
		expect(second.exitCode).toBe(0);
		const count = await fs.readFile(countFile, "utf8");
		expect(Number(count.trim())).toBe(1);
	});
});
