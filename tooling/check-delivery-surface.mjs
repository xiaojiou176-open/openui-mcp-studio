#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REQUIRED_TOOL_FILES = [
	"services/mcp-server/src/tools/workspace-scan.ts",
	"services/mcp-server/src/tools/plan.ts",
	"services/mcp-server/src/tools/acceptance.ts",
	"services/mcp-server/src/tools/review-bundle.ts",
	"services/mcp-server/src/tools/ship-feature-flow.ts",
];

const REQUIRED_REGISTRATIONS = [
	"registerWorkspaceScanTool(server)",
	"registerPlanTool(server)",
	"registerAcceptanceTool(server)",
	"registerReviewBundleTool(server)",
	"registerShipFeatureFlowTool(server)",
];

async function readFile(rootDir, relativePath) {
	try {
		return await fs.readFile(path.resolve(rootDir, relativePath), "utf8");
	} catch (error) {
		throw new Error(
			`${relativePath} is missing or unreadable: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error },
		);
	}
}

export async function runDeliverySurfaceCheck(rootDir = process.cwd()) {
	const errors = [];

	for (const relativePath of REQUIRED_TOOL_FILES) {
		try {
			await fs.access(path.resolve(rootDir, relativePath));
		} catch {
			errors.push(`missing required tool file: ${relativePath}`);
		}
	}

	let indexSource = "";
	try {
		indexSource = await readFile(rootDir, "services/mcp-server/src/index.ts");
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	}
	for (const registrationCall of REQUIRED_REGISTRATIONS) {
		if (!indexSource.includes(registrationCall)) {
			errors.push(
				`index.ts does not mention required delivery surface registration "${registrationCall}"`,
			);
		}
	}

	let shipSource = "";
	try {
		shipSource = await readFile(rootDir, "services/mcp-server/src/tools/ship.ts");
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	}
	if (shipSource) {
		if (!shipSource.includes("../ship/core.js")) {
			errors.push("ship.ts is not delegating through ../ship/core.js");
		}
		if (
			shipSource.includes("snapshotFiles(") ||
			shipSource.includes("rollbackWrittenFiles(")
		) {
			errors.push(
				"ship.ts still contains core pipeline helpers; expected thin facade only",
			);
		}
	}

	return {
		ok: errors.length === 0,
		errors,
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const result = await runDeliverySurfaceCheck();
	if (!result.ok) {
		console.error("[delivery-surface] FAILED");
		for (const error of result.errors) {
			console.error(`- ${error}`);
		}
		process.exit(1);
	}
	console.log("[delivery-surface] OK");
}
