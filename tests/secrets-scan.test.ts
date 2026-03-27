import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const scanScriptPath = path.join(repoRoot, "tooling", "secrets_scan.sh");
const gitleaksConfigPath = path.join(repoRoot, ".gitleaks.toml");

function parseTripleQuotedTomlArray(
	content: string,
	key: "paths" | "regexes",
): string[] {
	const blockMatch = content.match(
		new RegExp(`${key}\\s*=\\s*\\[(.*?)\\]`, "s"),
	);
	if (!blockMatch) {
		return [];
	}
	return Array.from(blockMatch[1].matchAll(/'''([\s\S]*?)'''/g), (match) =>
		match[1].trim(),
	).filter((entry) => entry.length > 0);
}

async function runCommand(
	command: string,
	args: string[],
	cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(command, args, { cwd });
		return { code: 0, stdout, stderr };
	} catch (error) {
		const failed = error as {
			code?: number;
			stdout?: string;
			stderr?: string;
		};
		return {
			code: typeof failed.code === "number" ? failed.code : 1,
			stdout: failed.stdout ?? "",
			stderr: failed.stderr ?? "",
		};
	}
}

async function runCommandOrThrow(
	command: string,
	args: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string }> {
	const result = await runCommand(command, args, cwd);
	expect(result.code).toBe(0);
	return { stdout: result.stdout, stderr: result.stderr };
}

describe("secrets_scan staged mode", () => {
	it("scans git index content instead of workspace content", async () => {
		const workspace = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-"),
		);
		const targetFile = path.join(workspace, "src.ts");
		const stagedSecret = `const apiKey = '${["sk", "AAAAAAAAAAAAAAAAAAAAAA"].join("-")}';\n`;

		try {
			await runCommandOrThrow("git", ["init"], workspace);
			await fs.writeFile(targetFile, "const apiKey = 'safe-value';\n", "utf8");
			await runCommandOrThrow("git", ["add", "src.ts"], workspace);

			await fs.writeFile(targetFile, stagedSecret, "utf8");
			await runCommandOrThrow("git", ["add", "src.ts"], workspace);

			// Working tree is reverted to safe content; only staged blob keeps the secret.
			await fs.writeFile(
				targetFile,
				"const apiKey = 'sanitized-after-stage';\n",
				"utf8",
			);

			const result = await runCommand(
				"bash",
				[scanScriptPath, "--staged"],
				workspace,
			);
			expect(result.code).toBe(1);
			expect(result.stdout).toContain("src.ts");
			expect(result.stdout).not.toContain("sanitized-after-stage");
			expect(result.stderr).toContain("secrets_scan: potential secrets found");
		} finally {
			await fs.rm(workspace, { recursive: true, force: true });
		}
	}, 30_000);

	it("scans renamed files in staged index", async () => {
		const workspace = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-renamed-"),
		);
		const originalPath = path.join(workspace, "safe.ts");
		const renamedPath = path.join(workspace, "renamed.ts");
		const stagedSecret = `const apiKey = '${["sk", "CCCCCCCCCCCCCCCCCCCCCC"].join("-")}';\n`;

		try {
			await runCommandOrThrow("git", ["init"], workspace);
			await runCommandOrThrow(
				"git",
				["config", "user.email", "secrets-scan-test@example.com"],
				workspace,
			);
			await runCommandOrThrow(
				"git",
				["config", "user.name", "secrets-scan-test"],
				workspace,
			);
			await fs.writeFile(
				originalPath,
				"const apiKey = 'safe-value';\n",
				"utf8",
			);
			await runCommandOrThrow("git", ["add", "safe.ts"], workspace);
			await runCommandOrThrow("git", ["commit", "-m", "init"], workspace);
			await runCommandOrThrow(
				"git",
				["mv", "safe.ts", "renamed.ts"],
				workspace,
			);
			await fs.writeFile(renamedPath, stagedSecret, "utf8");
			await runCommandOrThrow("git", ["add", "renamed.ts"], workspace);

			const result = await runCommand(
				"bash",
				[scanScriptPath, "--staged"],
				workspace,
			);
			expect(result.code).toBe(1);
			expect(result.stdout).toContain("renamed.ts");
			expect(result.stderr).toContain("secrets_scan: potential secrets found");
		} finally {
			await fs.rm(workspace, { recursive: true, force: true });
		}
	}, 30_000);

	it("fails fast when --staged is executed outside a git worktree", async () => {
		const nonGitTmpRoot =
			process.platform === "linux" ? "/dev/shm" : os.tmpdir();
		const workspace = await fs.mkdtemp(
			path.join(nonGitTmpRoot, "openui-secrets-scan-no-git-"),
		);

		try {
			const result = await runCommand(
				"bash",
				[scanScriptPath, "--staged"],
				workspace,
			);
			expect(result.code).toBe(2);
			expect(result.stderr).toContain(
				"--staged scans must run inside a git worktree",
			);
		} finally {
			await fs.rm(workspace, { recursive: true, force: true });
		}
	}, 30_000);
});

describe("secrets_scan workspace mode", () => {
	it("scans real file content when using --path outside cwd", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-path-"),
		);
		const workspace = path.join(tempRoot, "workspace");
		const externalScanPath = path.join(tempRoot, "external");
		const targetFile = path.join(externalScanPath, "secret.ts");

		try {
			await fs.mkdir(workspace, { recursive: true });
			await fs.mkdir(externalScanPath, { recursive: true });
			const fakeSkToken = `${["sk", "BBBBBBBBBBBBBBBBBBBBBB"].join("-")}`;
			await fs.writeFile(
				targetFile,
				`const apiKey = '${fakeSkToken}';\n`,
				"utf8",
			);

			const result = await runCommand(
				"bash",
				[scanScriptPath, "--path", externalScanPath],
				workspace,
			);

			expect(result.code).toBe(1);
			expect(result.stdout).toContain("[REDACTED]");
			expect(result.stdout).not.toContain(fakeSkToken);
			expect(result.stderr).toContain("secrets_scan: potential secrets found");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 30_000);

	it("detects GitHub app token prefixes (e.g. ghs_)", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-github-prefix-"),
		);
		const targetFile = path.join(tempRoot, "gh-token.ts");

		try {
			const ghToken = `${["ghs", "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"].join("_")}`;
			await fs.writeFile(targetFile, `const token = "${ghToken}";\n`, "utf8");

			const result = await runCommand(
				"bash",
				[scanScriptPath, "--path", tempRoot],
				tempRoot,
			);

			expect(result.code).toBe(1);
			expect(result.stdout).toContain("[REDACTED]");
			expect(result.stdout).not.toContain(ghToken);
			expect(result.stderr).toContain("secrets_scan: potential secrets found");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 30_000);

	it("detects OpenAI project key prefix sk-proj and redacts output", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-sk-proj-"),
		);
		const targetFile = path.join(tempRoot, "openai-project-key.ts");

		try {
			const projectKey = `sk-proj-${[
				"ABCD",
				"EFGH",
				"IJKL",
				"MNOP",
				"QRST",
				"UVWX",
				"YZ12",
				"3456",
			].join("")}`;
			await fs.writeFile(
				targetFile,
				`const token = "${projectKey}";\n`,
				"utf8",
			);

			const result = await runCommand(
				"bash",
				[scanScriptPath, "--path", tempRoot],
				tempRoot,
			);

			expect(result.code).toBe(1);
			expect(result.stdout).toContain("[REDACTED]");
			expect(result.stdout).not.toContain(projectKey);
			expect(result.stderr).toContain("secrets_scan: potential secrets found");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 30_000);

	it("returns success when workspace files do not contain known secret patterns", async () => {
		const workspace = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-clean-workspace-"),
		);
		const safePath = path.join(workspace, "safe.ts");

		try {
			await fs.writeFile(
				safePath,
				"const apiKey = 'sanitized-value';\nconst note = 'hello';\n",
				"utf8",
			);

			const result = await runCommand(
				"bash",
				[scanScriptPath, "--path", workspace],
				workspace,
			);

			expect(result.code).toBe(0);
			expect(result.stdout).toContain(
				"secrets_scan: OK (no known secret patterns detected)",
			);
		} finally {
			await fs.rm(workspace, { recursive: true, force: true });
		}
	}, 30_000);
});

describe("secrets_scan staged clean mode", () => {
	it("returns success when staged content is clean", async () => {
		const workspace = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-clean-staged-"),
		);
		const targetFile = path.join(workspace, "safe.ts");

		try {
			await runCommandOrThrow("git", ["init"], workspace);
			await fs.writeFile(targetFile, "const token = 'safe';\n", "utf8");
			await runCommandOrThrow("git", ["add", "safe.ts"], workspace);

			const result = await runCommand(
				"bash",
				[scanScriptPath, "--staged"],
				workspace,
			);
			expect(result.code).toBe(0);
			expect(result.stdout).toContain(
				"secrets_scan: OK (no known secret patterns detected)",
			);
			expect(result.stderr.trim()).toBe("");
		} finally {
			await fs.rm(workspace, { recursive: true, force: true });
		}
	}, 30_000);

	it("does not fail when secret exists only in unstaged workspace content", async () => {
		const workspace = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-unstaged-only-"),
		);
		const targetFile = path.join(workspace, "safe.ts");

		try {
			await runCommandOrThrow("git", ["init"], workspace);
			await fs.writeFile(targetFile, "const token = 'safe';\n", "utf8");
			await runCommandOrThrow("git", ["add", "safe.ts"], workspace);

			const unstagedSecret = `${["sk", "DDDDDDDDDDDDDDDDDDDDDD"].join("-")}`;
			await fs.writeFile(
				targetFile,
				`const token = '${unstagedSecret}';\n`,
				"utf8",
			);

			const result = await runCommand(
				"bash",
				[scanScriptPath, "--staged"],
				workspace,
			);
			expect(result.code).toBe(0);
			expect(result.stdout).toContain(
				"secrets_scan: OK (no known secret patterns detected)",
			);
			expect(result.stdout).not.toContain(unstagedSecret);
		} finally {
			await fs.rm(workspace, { recursive: true, force: true });
		}
	}, 30_000);
});

describe("secrets_scan argument validation", () => {
	it("returns usage error when --path has no value", async () => {
		const workspace = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-args-path-"),
		);

		try {
			const result = await runCommand(
				"bash",
				[scanScriptPath, "--path"],
				workspace,
			);
			expect(result.code).toBe(2);
			expect(result.stderr).toContain("--path requires a value");
		} finally {
			await fs.rm(workspace, { recursive: true, force: true });
		}
	});

	it("returns usage error on unknown option", async () => {
		const workspace = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-secrets-scan-args-unknown-"),
		);

		try {
			const result = await runCommand(
				"bash",
				[scanScriptPath, "--unknown-option"],
				workspace,
			);
			expect(result.code).toBe(2);
			expect(result.stderr).toContain("unknown option");
		} finally {
			await fs.rm(workspace, { recursive: true, force: true });
		}
	});
});

describe("gitleaks allowlist hardening", () => {
	it("keeps allowlisted paths anchored to the secrets baseline only", async () => {
		const config = await fs.readFile(gitleaksConfigPath, "utf8");
		const paths = parseTripleQuotedTomlArray(config, "paths");

		expect(paths).toEqual([
			"^(?:\\./)?\\.secrets\\.baseline$",
		]);
	});

	it("allowlists only explicit dummy values instead of broad wildcard patterns", async () => {
		const config = await fs.readFile(gitleaksConfigPath, "utf8");
		const regexes = parseTripleQuotedTomlArray(config, "regexes");

		expect(regexes).toEqual([
			"^(?:token-value|apikey-value|password-value|secret-value|generic-key-value|nested-token-value|list-secret-value|top-secret-value)$",
		]);
		expect(regexes[0]).not.toMatch(
			/\(token\|apikey\|secret\|password\|key\)-value/i,
		);
		expect(regexes[0]).not.toMatch(/sk-test|sk-0\{20,\}/i);
	});

	it("does not allowlist real key-shaped strings while preserving fixture dummy values", async () => {
		const config = await fs.readFile(gitleaksConfigPath, "utf8");
		const regexes = parseTripleQuotedTomlArray(config, "regexes").map(
			(pattern) => new RegExp(pattern),
		);

		const dummyValues = [
			"token-value",
			"apikey-value",
			"password-value",
			"secret-value",
			"generic-key-value",
			"nested-token-value",
			"list-secret-value",
			"top-secret-value",
		];
		for (const dummyValue of dummyValues) {
			expect(regexes.some((regex) => regex.test(dummyValue))).toBe(true);
		}

		const realLikeSecrets = [
			`sk-${"A".repeat(22)}`,
			`sk-test${"1".repeat(16)}`,
			`ghp_${"A".repeat(36)}`,
			`AIza${"A".repeat(35)}`,
			`sk-proj-${"A".repeat(32)}`,
		];
		for (const secret of realLikeSecrets) {
			expect(regexes.some((regex) => regex.test(secret))).toBe(false);
		}
	});
});
