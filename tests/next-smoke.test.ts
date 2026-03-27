import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runNextSmoke } from "../services/mcp-server/src/next-smoke.js";

const tempDirs: string[] = [];
const ORIGINAL_WORKSPACE_ROOT = process.env.OPENUI_MCP_WORKSPACE_ROOT;

async function mkTempDir(prefix: string): Promise<string> {
	const runtimeRoot = path.join(os.tmpdir(), "openui-next-smoke-tests");
	await fs.mkdir(runtimeRoot, { recursive: true });
	const dir = await fs.mkdtemp(path.join(runtimeRoot, prefix));
	tempDirs.push(dir);
	return dir;
}

async function writeFakeRuntimePackage(input: {
	root: string;
	startMode: "serve" | "hang";
}): Promise<void> {
	const packageJsonPath = path.join(input.root, "package.json");
	const nextPackageJsonPath = path.join(
		input.root,
		"node_modules",
		"next",
		"package.json",
	);
	const reactPackageJsonPath = path.join(
		input.root,
		"node_modules",
		"react",
		"package.json",
	);
	const reactDomPackageJsonPath = path.join(
		input.root,
		"node_modules",
		"react-dom",
		"package.json",
	);
	const nextBinPath = path.join(input.root, "node_modules", ".bin", "next");

	await fs.mkdir(path.dirname(nextPackageJsonPath), { recursive: true });
	await fs.mkdir(path.dirname(reactPackageJsonPath), { recursive: true });
	await fs.mkdir(path.dirname(reactDomPackageJsonPath), { recursive: true });
	await fs.mkdir(path.dirname(nextBinPath), { recursive: true });

	await fs.writeFile(
		packageJsonPath,
		JSON.stringify(
			{
				name: "next-smoke-fake-runtime",
				private: true,
				version: "0.0.0",
				dependencies: {
					next: "15.0.0",
				},
			},
			null,
			2,
		),
		"utf8",
	);

	await fs.writeFile(
		nextPackageJsonPath,
		JSON.stringify({ name: "next", version: "15.0.0" }, null, 2),
		"utf8",
	);
	await fs.writeFile(
		reactPackageJsonPath,
		JSON.stringify({ name: "react", version: "18.3.1" }, null, 2),
		"utf8",
	);
	await fs.writeFile(
		reactDomPackageJsonPath,
		JSON.stringify({ name: "react-dom", version: "18.3.1" }, null, 2),
		"utf8",
	);

	const startBody =
		input.startMode === "serve"
			? [
					"const http = require('node:http');",
					"const port = Number(process.env.PORT || 3000);",
					"const server = http.createServer((req, res) => {",
					"  res.statusCode = 200;",
					"  res.end('fake-next-ok');",
					"});",
					"server.listen(port, '127.0.0.1', () => {",
					"  console.log(`fake-start-ready:${port}`);",
					"});",
				].join("\n")
			: [
					"console.log('fake-start-hang-no-server');",
					"setInterval(() => {}, 1000);",
				].join("\n");

	const binScript = [
		"#!/usr/bin/env node",
		"const command = process.argv[2];",
		"if (command === 'build') {",
		"  console.log('fake-build-ok');",
		"  process.exit(0);",
		"}",
		"if (command === 'start') {",
		startBody,
		"  return;",
		"}",
		"console.error(`unexpected fake-next command: ${String(command)}`);",
		"process.exit(1);",
		"",
	].join("\n");

	await fs.writeFile(nextBinPath, binScript, {
		encoding: "utf8",
		mode: 0o755,
	});
}

async function isProcessGone(pid: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			process.kill(pid, 0);
			await new Promise((resolve) => setTimeout(resolve, 50));
		} catch {
			return true;
		}
	}
	return false;
}

afterEach(async () => {
	if (ORIGINAL_WORKSPACE_ROOT === undefined) {
		delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	} else {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = ORIGINAL_WORKSPACE_ROOT;
	}
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("runNextSmoke", () => {
	it("fails immediately when preferred target root is unusable", async () => {
		const missingRoot = path.join(
			await mkTempDir("next-smoke-missing-"),
			"missing",
		);

		const result = await runNextSmoke({
			targetRoot: missingRoot,
			buildTimeoutMs: 5_000,
			probeTimeoutMs: 5_000,
			probeIntervalMs: 100,
		});

		expect(result.passed).toBe(false);
		expect(result.usedTargetRoot).toBe(missingRoot);
		expect(result.build.ok).toBe(false);
		expect(result.start.ok).toBe(false);
		expect(result.probe.ok).toBe(false);
		expect(
			result.logsTail.some((line) =>
				line.includes("Preferred target unusable"),
			),
		).toBe(true);
	}, 20_000);

	it("uses external target root when valid and reports full successful flow", async () => {
		const root = await mkTempDir("next-smoke-success-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = root;
		await writeFakeRuntimePackage({ root, startMode: "serve" });

		const result = await runNextSmoke({
			targetRoot: root,
			buildTimeoutMs: 5_000,
			probeTimeoutMs: 5_000,
			probeIntervalMs: 100,
		});

		expect(result.passed).toBe(true);
		expect(result.usedTargetRoot).toBe(root);
		expect(result.build.ok).toBe(true);
		expect(result.start.ok).toBe(true);
		expect(result.start.cleanup).not.toBe("failed");
		expect(result.start.detail).toContain("Start process is running");
		expect(result.start.detail).toContain("Cleanup:");
		expect(result.probe.ok).toBe(true);
		expect(result.probe.statusCode).toBe(200);
		expect(
			result.logsTail.some((line) =>
				line.includes(`Using preferred target root: ${root}`),
			),
		).toBe(true);
		expect(result.logsTail.some((line) => line.includes("fake-build-ok"))).toBe(
			true,
		);
		expect(
			result.logsTail.some((line) => line.includes("fake-start-ready:")),
		).toBe(true);
	}, 20_000);

	it("fails when start never becomes reachable before timeout and keeps timeout evidence + cleanup", async () => {
		const root = await mkTempDir("next-smoke-timeout-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = root;
		await writeFakeRuntimePackage({ root, startMode: "hang" });

		const result = await runNextSmoke({
			targetRoot: root,
			buildTimeoutMs: 5_000,
			startupGraceMs: 200,
			probeTimeoutMs: 700,
			probeIntervalMs: 100,
		});

		expect(result.passed).toBe(false);
		expect(result.build.ok).toBe(true);
		expect(result.start.ok).toBe(true);
		expect(result.start.cleanup).not.toBe("failed");
		expect(result.start.detail).toContain("Cleanup:");
		expect(result.probe.ok).toBe(false);
		expect(result.probe.detail).toContain("Probe timed out after 1000ms");
		expect(result.probe.detail).toContain("Last error:");
		expect(
			result.logsTail.some((line) =>
				line.includes("fake-start-hang-no-server"),
			),
		).toBe(true);
		expect(
			result.logsTail.some((line) =>
				line.includes("[probe] Probe attempt failed"),
			),
		).toBe(true);

		const startedPid = result.start.pid;
		expect(typeof startedPid).toBe("number");
		await expect(isProcessGone(startedPid as number, 3_000)).resolves.toBe(
			true,
		);
	}, 20_000);

});
