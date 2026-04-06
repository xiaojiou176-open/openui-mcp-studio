import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("run-upstream-policy-ci", () => {
	it("skips cleanly when branch context is unavailable", async () => {
		const scriptPath = path.resolve(
			process.cwd(),
			"tooling/run-upstream-policy-ci.mjs",
		);
		const run = spawnSync(process.execPath, [scriptPath], {
			encoding: "utf8",
			env: {
				...process.env,
				GITHUB_HEAD_REF: "",
				GITHUB_REF_NAME: "",
			},
		});

		expect(run.status).toBe(0);
		expect(run.stdout).toContain(
			"Skipping upstream policy check: branch context unavailable in container env.",
		);
	});

	it("skips cleanly for non upstream-sync branches", async () => {
		const scriptPath = path.resolve(
			process.cwd(),
			"tooling/run-upstream-policy-ci.mjs",
		);
		const run = spawnSync(process.execPath, [scriptPath], {
			encoding: "utf8",
			env: {
				...process.env,
				GITHUB_HEAD_REF: "codex/repo-closure-20260325",
				GITHUB_REF_NAME: "main",
			},
		});

		expect(run.status).toBe(0);
		expect(run.stdout).toContain(
			"Skipping upstream policy check for branch 'codex/repo-closure-20260325': only upstream-sync branches are enforced in PR/push CI.",
		);
	});

	it("invokes sync:upstream:check for upstream-sync branches", async () => {
		const root = await mkTempDir("openui-upstream-policy-ci-");
		const binDir = path.join(root, "bin");
		const logPath = path.join(root, "npm-args.log");
		await fs.mkdir(binDir, { recursive: true });
		await fs.writeFile(
			path.join(binDir, "npm"),
			["#!/bin/sh", 'printf "%s\\n" "$@" > "$NPM_ARGS_LOG_PATH"'].join("\n"),
			{ encoding: "utf8", mode: 0o755 },
		);

		const scriptPath = path.resolve(
			process.cwd(),
			"tooling/run-upstream-policy-ci.mjs",
		);
		const run = spawnSync(process.execPath, [scriptPath], {
			encoding: "utf8",
			env: {
				...process.env,
				PATH: `${binDir}:${process.env.PATH ?? ""}`,
				NPM_ARGS_LOG_PATH: logPath,
				GITHUB_HEAD_REF: "chore/upstream-sync-20260326",
				GITHUB_REF_NAME: "main",
			},
		});

		expect(run.status).toBe(0);
		expect((await fs.readFile(logPath, "utf8")).trim().split("\n")).toEqual([
			"run",
			"sync:upstream:check",
			"--",
			"--mode=blocking",
		]);
	});
});
