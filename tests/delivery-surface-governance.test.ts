import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDeliverySurfaceCheck } from "../tooling/check-delivery-surface.mjs";

const tempDirs = [];

async function mkTempDir(prefix) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

async function writeFile(rootDir, relativePath, content) {
	const absolutePath = path.join(rootDir, relativePath);
	await fs.mkdir(path.dirname(absolutePath), { recursive: true });
	await fs.writeFile(absolutePath, content, "utf8");
}

const REQUIRED_INDEX_TEXT = [
	"registerWorkspaceScanTool(server);",
	"registerPlanTool(server);",
	"registerAcceptanceTool(server);",
	"registerReviewBundleTool(server);",
	"registerShipFeatureFlowTool(server);",
	"// openui_scan_workspace_profile",
	"// openui_plan_change",
	"// openui_build_acceptance_pack",
	"// openui_build_review_bundle",
	"// openui_ship_feature_flow",
].join("\n");

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("delivery surface governance", () => {
	it("passes when the delivery plane is registered through the thin ship facade", async () => {
		const rootDir = await mkTempDir("openui-delivery-surface-");
		await writeFile(
			rootDir,
			"services/mcp-server/src/index.ts",
			REQUIRED_INDEX_TEXT,
		);
		await writeFile(
			rootDir,
			"services/mcp-server/src/tools/ship.ts",
			"import { executeShipPage, __test__ } from '../ship/core.js';\nexport { __test__ };\n",
		);
		for (const filePath of [
			"services/mcp-server/src/tools/workspace-scan.ts",
			"services/mcp-server/src/tools/plan.ts",
			"services/mcp-server/src/tools/acceptance.ts",
			"services/mcp-server/src/tools/review-bundle.ts",
			"services/mcp-server/src/tools/ship-feature-flow.ts",
		]) {
			await writeFile(rootDir, filePath, "export {};\n");
		}

		await expect(runDeliverySurfaceCheck(rootDir)).resolves.toEqual({
			ok: true,
			errors: [],
		});
	});

	it("fails when ship.ts still embeds core helper bodies", async () => {
		const rootDir = await mkTempDir("openui-delivery-surface-");
		await writeFile(
			rootDir,
			"services/mcp-server/src/index.ts",
			REQUIRED_INDEX_TEXT,
		);
		await writeFile(
			rootDir,
			"services/mcp-server/src/tools/ship.ts",
			"function snapshotFiles() {}\nfunction rollbackWrittenFiles() {}\n",
		);
		for (const filePath of [
			"services/mcp-server/src/tools/workspace-scan.ts",
			"services/mcp-server/src/tools/plan.ts",
			"services/mcp-server/src/tools/acceptance.ts",
			"services/mcp-server/src/tools/review-bundle.ts",
			"services/mcp-server/src/tools/ship-feature-flow.ts",
		]) {
			await writeFile(rootDir, filePath, "export {};\n");
		}

		const result = await runDeliverySurfaceCheck(rootDir);
		expect(result.ok).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.stringContaining("ship.ts is not delegating"),
				expect.stringContaining("ship.ts still contains core pipeline helpers"),
			]),
		);
	});
});
