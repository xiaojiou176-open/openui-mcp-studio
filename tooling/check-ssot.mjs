import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toPosixPath } from "./shared/governance-utils.mjs";

const REQUIRED_CONTRACTS = [
	"contracts/governance/root-allowlist.json",
	"contracts/governance/dependency-boundaries.json",
	"contracts/governance/module-topology.json",
	"contracts/governance/public-surfaces.json",
	"contracts/runtime/path-registry.json",
	"contracts/runtime/run-layout.json",
	"contracts/observability/log-event.schema.json",
	"contracts/upstream/inventory.json",
	"contracts/upstream/pinned-sources.json",
	"contracts/upstream/compatibility-matrix.json",
	"contracts/upstream/patch-registry.json",
	"contracts/upstream/glue-surfaces.json",
];

async function runSsotCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const docsIndexPath = path.resolve(rootDir, "docs/index.md");
	const docsIndex = await fs.readFile(docsIndexPath, "utf8");
	const errors = [];

	for (const contractPath of REQUIRED_CONTRACTS) {
		try {
			await fs.access(path.resolve(rootDir, contractPath));
		} catch {
			errors.push(`missing authoritative contract: ${contractPath}`);
		}
		if (!docsIndex.includes(contractPath)) {
			errors.push(`docs/index.md must reference authoritative contract ${contractPath}`);
		}
	}

	if (!docsIndex.includes("Historical Archive")) {
		errors.push('docs/index.md must keep an explicit "Historical Archive" section');
	}
	if (
		!docsIndex.includes("Archive material is historical only") &&
		!docsIndex.includes("historical only and must not be treated as the current operating truth")
	) {
		errors.push("docs/index.md must state that archive docs are historical only");
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		errors,
	};
}

async function main() {
	try {
		const result = await runSsotCheck();
		if (!result.ok) {
			console.error("[ssot] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[ssot] OK");
	} catch (error) {
		console.error(`[ssot] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runSsotCheck };
