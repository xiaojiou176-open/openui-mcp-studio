import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];
const scriptPath = path.resolve(
	process.cwd(),
	"tooling/check-resource-leaks.mjs",
);

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

async function initGitRepo(root: string): Promise<void> {
	execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "test@example.com"], {
		cwd: root,
		stdio: "ignore",
	});
	execFileSync("git", ["config", "user.name", "test"], {
		cwd: root,
		stdio: "ignore",
	});
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("resource leak audit script", () => {
	it("does not hang on unclosed hook block and still returns audit result", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-unclosed-hook-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "unclosed-hook.test.ts"),
			[
				'import { afterEach, it } from "vitest";',
				"",
				"afterEach(() => {",
				'it("x", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
			timeout: 1_500,
		});

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("[resource-leak-audit]");
	});

	it("fails on void cleanup in afterEach", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-fail-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "bad.test.ts"),
			[
				'import fs from "node:fs/promises";',
				'import { afterEach, it } from "vitest";',
				"",
				"afterEach(() => {",
				'\tvoid fs.rm("/tmp/demo", { recursive: true, force: true });',
				"});",
				"",
				'it("x", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("void-cleanup-call");
	});

	it("fails when non-async cleanup hook calls async resource cleanup without await/return", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-non-async-fail-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "non-async-cleanup-bad.test.ts"),
			[
				'import fs from "node:fs/promises";',
				'import { afterEach, it } from "vitest";',
				"",
				"afterEach(() => {",
				'\tfs.rm("/tmp/demo", { recursive: true, force: true });',
				"});",
				"",
				'it("x", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("non-async-hook-async-cleanup");
	});

	it("fails when parameterized cleanup hook skips await/return on async cleanup", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-param-hook-fail-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "param-hook-bad.test.ts"),
			[
				'import fs from "node:fs/promises";',
				'import { afterEach, it } from "vitest";',
				"",
				"afterEach((_ctx) => {",
				'\tfs.rm("/tmp/demo", { recursive: true, force: true });',
				"});",
				"",
				'it("x", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("non-async-hook-async-cleanup");
	});

	it("fails when function-style cleanup hook skips await/return on async cleanup", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-fn-hook-fail-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "fn-hook-bad.test.ts"),
			[
				'import fs from "node:fs/promises";',
				'import { afterEach, it } from "vitest";',
				"",
				"afterEach(function () {",
				'\tfs.rm("/tmp/demo", { recursive: true, force: true });',
				"});",
				"",
				'it("x", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("non-async-hook-async-cleanup");
	});

	it("fails on expression-body void cleanup in afterEach", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-expr-void-fail-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "expr-void-bad.test.ts"),
			[
				'import fs from "node:fs/promises";',
				'import { afterEach, it } from "vitest";',
				"",
				"afterEach(() => void fs.rm('/tmp/demo', { recursive: true, force: true }));",
				'it("x", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("void-cleanup-call");
	});

	it("passes when afterEach awaits cleanup promise", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-pass-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "good.test.ts"),
			[
				'import fs from "node:fs/promises";',
				'import { afterEach, it } from "vitest";',
				"",
				"afterEach(async () => {",
				"\tawait Promise.all([",
				'\t\tfs.rm("/tmp/demo", { recursive: true, force: true }),',
				"\t]);",
				"});",
				"",
				'it("x", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("[resource-leak-audit] PASSED");
	});

	it("checks only staged test files when --staged is used", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-staged-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await initGitRepo(root);

		await fs.writeFile(
			path.join(root, "tests", "good.test.ts"),
			[
				'import fs from "node:fs/promises";',
				'import { afterEach, it } from "vitest";',
				"afterEach(async () => {",
				'\tawait fs.rm("/tmp/demo", { recursive: true, force: true });',
				"});",
				'it("ok", () => {});',
			].join("\n"),
			"utf8",
		);
		await fs.writeFile(
			path.join(root, "tests", "bad.test.ts"),
			[
				'import fs from "node:fs/promises";',
				'import { afterEach, it } from "vitest";',
				"afterEach(() => {",
				'\tvoid fs.rm("/tmp/demo", { recursive: true, force: true });',
				"});",
				'it("bad", () => {});',
			].join("\n"),
			"utf8",
		);

		execFileSync("git", ["add", "tests/good.test.ts"], {
			cwd: root,
			stdio: "ignore",
		});
		const stagedOnlyGood = spawnSync(
			process.execPath,
			[scriptPath, "--staged"],
			{
				cwd: root,
				encoding: "utf8",
			},
		);
		expect(stagedOnlyGood.status).toBe(0);

		execFileSync("git", ["add", "tests/bad.test.ts"], {
			cwd: root,
			stdio: "ignore",
		});
		const stagedIncludesBad = spawnSync(
			process.execPath,
			[scriptPath, "--staged"],
			{
				cwd: root,
				encoding: "utf8",
			},
		);
		expect(stagedIncludesBad.status).toBe(1);
		expect(stagedIncludesBad.stderr).toContain("bad.test.ts");
	}, 30_000);

	it("checks renamed staged test files when --staged is used", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-staged-rename-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await initGitRepo(root);

		await fs.writeFile(
			path.join(root, "tests", "original.test.ts"),
			['import { it } from "vitest";', 'it("ok", () => {});'].join("\n"),
			"utf8",
		);

		execFileSync("git", ["add", "tests/original.test.ts"], {
			cwd: root,
			stdio: "ignore",
		});
		execFileSync("git", ["commit", "-m", "seed"], {
			cwd: root,
			stdio: "ignore",
		});

		execFileSync(
			"git",
			["mv", "tests/original.test.ts", "tests/renamed-bad.test.ts"],
			{
				cwd: root,
				stdio: "ignore",
			},
		);
		await fs.writeFile(
			path.join(root, "tests", "renamed-bad.test.ts"),
			[
				'import fs from "node:fs/promises";',
				'import { afterEach, it } from "vitest";',
				"",
				"afterEach(() => {",
				'\tvoid fs.rm("/tmp/demo", { recursive: true, force: true });',
				"});",
				'it("bad", () => {});',
			].join("\n"),
			"utf8",
		);
		execFileSync("git", ["add", "-A"], {
			cwd: root,
			stdio: "ignore",
		});

		const result = spawnSync(process.execPath, [scriptPath, "--staged"], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("renamed-bad.test.ts");
		expect(result.stderr).toContain("void-cleanup-call");
	}, 30_000);

	it("checks staged src test files when --staged is used", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-staged-src-");
		await fs.mkdir(path.join(root, "src"), { recursive: true });
		await initGitRepo(root);

		await fs.writeFile(
			path.join(root, "src", "bad.test.ts"),
			[
				'import { it, vi } from "vitest";',
				"const target = { run: () => 1 };",
				'vi.spyOn(target, "run");',
				'it("bad", () => {});',
			].join("\n"),
			"utf8",
		);
		execFileSync("git", ["add", "src/bad.test.ts"], {
			cwd: root,
			stdio: "ignore",
		});

		const result = spawnSync(process.execPath, [scriptPath, "--staged"], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("src/bad.test.ts");
		expect(result.stderr).toContain("mock-no-restore");
	}, 30_000);

	it("fails when process.env is modified without restoration in cleanup hook", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-env-fail-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-bad.test.ts"),
			[
				'import { afterEach, it } from "vitest";',
				"",
				'process.env["AUDIT_ENV_KEY"] = "value";',
				"afterEach(async () => {",
				'\tawait Promise.resolve("cleanup");',
				"});",
				'it("env", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("env-modification-no-restore");
	});

	it("passes when hooks exist and env restore is done in test-level try/finally", async () => {
		const root = await mkTempDir(
			"openui-resource-leak-audit-env-hook-plus-finally-pass-",
		);
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-hook-plus-finally-good.test.ts"),
			[
				'import { afterEach, it } from "vitest";',
				"",
				'process.env["AUDIT_ENV_KEY"] = "value";',
				"afterEach(async () => {",
				"\tawait Promise.resolve();",
				"});",
				'it("env restore in finally", async () => {',
				"\ttry {",
				"\t\tawait Promise.resolve();",
				"\t} finally {",
				'\t\tdelete process.env["AUDIT_ENV_KEY"];',
				"\t}",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stderr).not.toContain("env-modification-no-restore");
	});

	it("does not flag process.env comparisons as env mutation", async () => {
		const root = await mkTempDir(
			"openui-resource-leak-audit-env-compare-pass-",
		);
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-compare-good.test.ts"),
			[
				'import { afterEach, expect, it } from "vitest";',
				"",
				'const same = process.env.KEY === "x";',
				'const diff = process.env.KEY !== "x";',
				"afterEach(async () => {",
				"\tawait Promise.resolve();",
				"});",
				'it("env compare", () => {',
				"\texpect(same || diff).toBe(true);",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stderr).not.toContain("env-modification-no-restore");
	});

	it("fails on process.env modification when no cleanup hook exists", async () => {
		const root = await mkTempDir(
			"openui-resource-leak-audit-env-no-hook-fail-",
		);
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-no-hook-bad.test.ts"),
			[
				'import { it } from "vitest";',
				"",
				'process.env["AUDIT_ENV_KEY"] = "value";',
				'it("env", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("env-modification-no-restore");
	});

	it("fails when mocks are created without restoration in cleanup hook", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-mock-fail-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "mock-bad.test.ts"),
			[
				'import { afterEach, it, vi } from "vitest";',
				"",
				"const target = { run: () => 1 };",
				'vi.spyOn(target, "run");',
				"afterEach(async () => {",
				"\tawait Promise.resolve(target);",
				"});",
				'it("mock", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("mock-no-restore");
	});

	it("fails when cleanup hook uses vi.clearAllMocks without restoring mock implementations", async () => {
		const root = await mkTempDir(
			"openui-resource-leak-audit-clear-all-mocks-fail-",
		);
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "mock-clear-all-bad.test.ts"),
			[
				'import { afterEach, it, vi } from "vitest";',
				"",
				"const target = { run: () => 1 };",
				'vi.spyOn(target, "run");',
				"afterEach(() => {",
				"\tvi.clearAllMocks();",
				"});",
				'it("mock", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("mock-no-restore");
	});

	it("fails on mock creation when no cleanup hook exists", async () => {
		const root = await mkTempDir(
			"openui-resource-leak-audit-mock-no-hook-fail-",
		);
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "mock-no-hook-bad.test.ts"),
			[
				'import { it, vi } from "vitest";',
				"",
				"const target = { run: () => 1 };",
				'vi.spyOn(target, "run");',
				'it("mock", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("mock-no-restore");
	});

	it("passes when only local vi.fn() mocks are used without global restore", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-local-vifn-pass-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "mock-local-vifn-good.test.ts"),
			[
				'import { it, vi } from "vitest";',
				"",
				'it("local vi.fn", () => {',
				"\tconst localMock = vi.fn();",
				"\tlocalMock();",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stderr).not.toContain("mock-no-restore");
	});

	it("passes when env and mocks are both restored in cleanup hook", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-env-mock-pass-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-mock-good.test.ts"),
			[
				'import { afterEach, it, vi } from "vitest";',
				"",
				'process.env["AUDIT_ENV_KEY"] = "value";',
				"vi.fn();",
				"afterEach(async () => {",
				'\tdelete process.env["AUDIT_ENV_KEY"];',
				"\tvi.restoreAllMocks();",
				"\tawait Promise.resolve();",
				"});",
				'it("ok", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
	});

	it("passes when process.env dot notation is deleted in cleanup hook", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-env-dot-delete-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-dot-delete-good.test.ts"),
			[
				'import { afterEach, it } from "vitest";',
				"",
				'process.env.AUDIT_ENV_KEY = "value";',
				"afterEach(async () => {",
				"\tdelete process.env.AUDIT_ENV_KEY;",
				"\tawait Promise.resolve();",
				"});",
				'it("env", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
	});

	it("passes when cleanup hook delegates env reset to restoreEnv helper", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-env-helper-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-helper-good.test.ts"),
			[
				'import { afterEach, it } from "vitest";',
				"",
				'process.env["AUDIT_ENV_KEY"] = "value";',
				"function restoreEnv() {",
				'\tdelete process.env["AUDIT_ENV_KEY"];',
				"}",
				"afterEach(() => {",
				"\trestoreEnv();",
				"});",
				'it("env", () => {});',
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
	});

	it("passes when hooks exist and env restore happens only in test-level try/finally", async () => {
		const root = await mkTempDir("openui-resource-leak-audit-env-finally-");
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-finally-good.test.ts"),
			[
				'import { afterEach, it } from "vitest";',
				"",
				"afterEach(async () => {",
				"\tawait Promise.resolve();",
				"});",
				'it("env", async () => {',
				'\tprocess.env["AUDIT_ENV_KEY"] = "value";',
				"\ttry {",
				"\t\tawait Promise.resolve();",
				"\t} finally {",
				'\t\tdelete process.env["AUDIT_ENV_KEY"];',
				"\t}",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stderr).not.toContain("env-modification-no-restore");
	});

	it("fails when finally only reads process.env without restoration action", async () => {
		const root = await mkTempDir(
			"openui-resource-leak-audit-env-finally-read-only-fail-",
		);
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-finally-read-only-bad.test.ts"),
			[
				'import { it } from "vitest";',
				"",
				'it("env", async () => {',
				'\tprocess.env["AUDIT_ENV_KEY"] = "value";',
				"\ttry {",
				"\t\tawait Promise.resolve();",
				"\t} finally {",
				"\t\tvoid process.env.AUDIT_ENV_KEY;",
				"\t}",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("env-modification-no-restore");
	});

	it("passes when try/finally restores env via Object.assign", async () => {
		const root = await mkTempDir(
			"openui-resource-leak-audit-env-finally-assign-",
		);
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-finally-assign-good.test.ts"),
			[
				'import { it } from "vitest";',
				"",
				'it("env", async () => {',
				'\tprocess.env["AUDIT_ENV_KEY"] = "value";',
				"\ttry {",
				"\t\tawait Promise.resolve();",
				"\t} finally {",
				"\t\tObject.assign(process.env, { AUDIT_ENV_KEY: undefined });",
				"\t}",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
	});

	it("passes when finally restoration is nested inside inner blocks", async () => {
		const root = await mkTempDir(
			"openui-resource-leak-audit-env-finally-nested-",
		);
		await fs.mkdir(path.join(root, "tests"), { recursive: true });
		await fs.writeFile(
			path.join(root, "tests", "env-finally-nested-good.test.ts"),
			[
				'import { it } from "vitest";',
				"",
				'it("env", async () => {',
				'\tprocess.env["AUDIT_ENV_KEY"] = "value";',
				"\ttry {",
				"\t\tawait Promise.resolve();",
				"\t} finally {",
				"\t\tif (true) {",
				'\t\t\tdelete process.env["AUDIT_ENV_KEY"];',
				"\t\t}",
				"\t}",
				"});",
				"",
			].join("\n"),
			"utf8",
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
	});
});
