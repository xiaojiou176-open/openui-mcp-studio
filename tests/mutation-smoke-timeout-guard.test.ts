import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	assertMutationSummaryPathIsSafe,
	resolveSafeMutationSummaryWriteTarget,
	selectMutantsForMode,
} from "../tooling/run-mutation-smoke.mjs";

const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("run-mutation-smoke timeout guard", () => {
	it("uses SIGTERM then SIGKILL escalation for timed out child processes", async () => {
		const scriptPath = path.resolve(WORKSPACE_ROOT, "tooling", "run-mutation-smoke.mjs");
		const source = await fs.readFile(scriptPath, "utf8");

		expect(source).toContain("OPENUI_MUTATION_FORCE_KILL_GRACE_MS");
		expect(source).toContain('child.kill("SIGTERM")');
		expect(source).toContain('child.kill("SIGKILL")');
		expect(source).toContain("command timeout after");
		expect(source).toContain("sending SIGKILL");
	});

	it("rejects summary output path outside mutation runtime root", () => {
		expect(() =>
			assertMutationSummaryPathIsSafe(
				"../escape/mutation-summary.json",
				WORKSPACE_ROOT,
			),
		).toThrow(/must stay within/i);
	});

	it("rejects summary root symlink that resolves outside workspace", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-summary-root-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-summary-outside-"),
		);

		try {
			await fs.mkdir(path.join(workspaceRoot, ".runtime-cache"), {
				recursive: true,
			});
			await fs.symlink(
				outsideRoot,
				path.join(workspaceRoot, ".runtime-cache", "mutation"),
				"dir",
			);

			await expect(
				resolveSafeMutationSummaryWriteTarget(
					".runtime-cache/mutation/mutation-summary.json",
					workspaceRoot,
				),
			).rejects.toThrow(/resolves outside workspace via symlink/i);
		} finally {
			await Promise.all([
				fs.rm(workspaceRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	});

	it("rejects summary target symlink that points outside runtime root", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-summary-target-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-summary-target-outside-"),
		);
		const summaryPath = path.join(
			workspaceRoot,
			".runtime-cache",
			"mutation",
			"mutation-summary.json",
		);
		const outsideFile = path.join(outsideRoot, "outside-summary.json");

		try {
			await fs.mkdir(path.dirname(summaryPath), { recursive: true });
			await fs.writeFile(outsideFile, '{"outside":true}\n', "utf8");
			await fs.symlink(outsideFile, summaryPath);

			await expect(
				resolveSafeMutationSummaryWriteTarget(
					".runtime-cache/mutation/mutation-summary.json",
					workspaceRoot,
				),
			).rejects.toThrow(/must not be a symlink/i);
			await expect(fs.readFile(outsideFile, "utf8")).resolves.toContain(
				'"outside":true',
			);
		} finally {
			await Promise.all([
				fs.rm(workspaceRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	});

	it("tops quick mode back up to the configured minimum sample count", () => {
		const generatedMutants = [
			{
				id: "generate-routekey-fast",
				module: "services/mcp-server/src/tools/generate.ts",
				operator: "enum-substitution",
			},
			{
				id: "generate-temperature",
				module: "services/mcp-server/src/tools/generate.ts",
				operator: "numeric-literal",
			},
			{
				id: "refine-routekey-fast",
				module: "services/mcp-server/src/tools/refine.ts",
				operator: "enum-substitution",
			},
		];

		const selected = selectMutantsForMode("quick", generatedMutants, [
			"services/mcp-server/src/tools/generate.ts",
			"services/mcp-server/src/tools/refine.ts",
		]);

		expect(selected).toHaveLength(3);
		expect(selected.map((mutant) => mutant.id)).toContain(
			"generate-routekey-fast",
		);
		expect(selected.map((mutant) => mutant.id)).toContain(
			"refine-routekey-fast",
		);
		expect(selected.map((mutant) => mutant.id)).toContain(
			"generate-temperature",
		);
	});

	it("expands quick mode coverage across key modules when seed mutants are missing", () => {
		const generatedMutants = [
			{
				id: "generate-routekey-fast",
				module: "services/mcp-server/src/tools/generate.ts",
				operator: "enum-substitution",
			},
			{
				id: "path-utils-parent-traversal-guard",
				module: "packages/shared-runtime/src/path-utils.ts",
				operator: "predicate-boolean",
			},
			{
				id: "child-env-wildcard-match",
				module: "packages/shared-runtime/src/child-env.ts",
				operator: "regex-tightening",
			},
			{
				id: "refine-temperature",
				module: "services/mcp-server/src/tools/refine.ts",
				operator: "numeric-literal",
			},
		];

		const selected = selectMutantsForMode("quick", generatedMutants, [
			"services/mcp-server/src/tools/generate.ts",
			"packages/shared-runtime/src/path-utils.ts",
			"packages/shared-runtime/src/child-env.ts",
		]);

		expect(selected).toHaveLength(4);
		const selectedModules = new Set(selected.map((mutant) => mutant.module));
		expect(selectedModules).toContain("services/mcp-server/src/tools/generate.ts");
		expect(selectedModules).toContain("packages/shared-runtime/src/path-utils.ts");
		expect(selectedModules).toContain("packages/shared-runtime/src/child-env.ts");
	});
});
