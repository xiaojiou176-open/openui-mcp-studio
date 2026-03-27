import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	DEFAULT_EXCLUDED_DIR_NAMES,
	DUPLICATE_CHECK_STATUS_CODES,
	ERROR_THRESHOLD,
	runDuplicateRateCheck,
	runFileGovernance,
} from "../tooling/check-file-governance.mjs";

const tempDirs = new Set<string>();

async function createTempProject(): Promise<string> {
	const root = await fs.mkdtemp(
		path.join(os.tmpdir(), "openui-file-governance-"),
	);
	tempDirs.add(root);
	return root;
}

function createSourceLines(count: number): string {
	return `${Array.from({ length: count }, (_, index) => `const line_${index} = ${index};`).join("\n")}\n`;
}

afterEach(async () => {
	await Promise.all(
		Array.from(tempDirs).map(async (dir) => {
			await fs.rm(dir, { recursive: true, force: true });
			tempDirs.delete(dir);
		}),
	);
});

describe("file governance", () => {
	it("fails when first-party code exceeds 800 lines", async () => {
		const projectRoot = await createTempProject();
		await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
		await fs.writeFile(
			path.join(projectRoot, "src", "oversized.ts"),
			createSourceLines(ERROR_THRESHOLD + 1),
			"utf8",
		);

		const report = await runFileGovernance({
			projectRoot,
			includeRoots: ["src"],
		});

		expect(report.ok).toBe(false);
		expect(report.thresholds.failLinesExclusive).toBe(ERROR_THRESHOLD);
		expect(report.violations.failures).toContainEqual({
			path: "src/oversized.ts",
			lines: ERROR_THRESHOLD + 1,
			status: "error",
		});
	});

	it("supports configurable excluded directories", async () => {
		const projectRoot = await createTempProject();
		const generatedDir = path.join(projectRoot, "src", "generated");
		await fs.mkdir(generatedDir, { recursive: true });
		await fs.writeFile(
			path.join(generatedDir, "oversized.ts"),
			createSourceLines(ERROR_THRESHOLD + 1),
			"utf8",
		);

		const baseline = await runFileGovernance({
			projectRoot,
			includeRoots: ["src"],
		});
		expect(baseline.ok).toBe(false);

		const report = await runFileGovernance({
			projectRoot,
			includeRoots: ["src"],
			excludedDirectoryNames: [...DEFAULT_EXCLUDED_DIR_NAMES, "generated"],
		});

		expect(report.ok).toBe(true);
		expect(
			report.files.some((file) => file.path === "src/generated/oversized.ts"),
		).toBe(false);
	});

	it("returns downgraded status when jscpd dependency is unavailable", async () => {
		const projectRoot = await createTempProject();
		await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
		await fs.writeFile(
			path.join(projectRoot, "src", "app.ts"),
			"export const ok = true;\n",
			"utf8",
		);

		const report = await runDuplicateRateCheck({
			projectRoot,
			includeRoots: ["src"],
		});

		expect(report.ok).toBe(true);
		expect(report.status).toBe("degraded");
		expect(report.reason).toBe("missing_jscpd_dependency");
		expect(report.statusCode).toBe(DUPLICATE_CHECK_STATUS_CODES.unavailable);
	});

	it("maps duplicate checker exit codes to stable status codes", async () => {
		const projectRoot = await createTempProject();
		await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
		await fs.writeFile(
			path.join(projectRoot, "src", "app.ts"),
			"export const ok = true;\n",
			"utf8",
		);

		const passReport = await runDuplicateRateCheck({
			projectRoot,
			includeRoots: ["src"],
			jscpdBinaryPath: "/tmp/jscpd",
			executor: async () => ({ exitCode: 0, stdout: "pass", stderr: "" }),
		});
		const failReport = await runDuplicateRateCheck({
			projectRoot,
			includeRoots: ["src"],
			jscpdBinaryPath: "/tmp/jscpd",
			executor: async () => ({
				exitCode: 1,
				stdout: "",
				stderr: "duplication",
			}),
		});
		const errorReport = await runDuplicateRateCheck({
			projectRoot,
			includeRoots: ["src"],
			jscpdBinaryPath: "/tmp/jscpd",
			executor: async () => ({
				exitCode: 42,
				stdout: "",
				stderr: "unexpected",
			}),
		});

		expect(passReport.statusCode).toBe(DUPLICATE_CHECK_STATUS_CODES.pass);
		expect(failReport.statusCode).toBe(DUPLICATE_CHECK_STATUS_CODES.fail);
		expect(errorReport.statusCode).toBe(DUPLICATE_CHECK_STATUS_CODES.error);
	});
});
