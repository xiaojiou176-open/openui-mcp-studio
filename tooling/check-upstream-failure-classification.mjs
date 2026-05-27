import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_INVENTORY_PATH = "contracts/upstream/inventory.json";
const REQUIRED_CATEGORIES = ["repo", "upstream", "version_combination", "environment"];

async function runUpstreamFailureClassificationCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const inventoryPath = path.resolve(
		rootDir,
		options.inventoryPath ?? DEFAULT_INVENTORY_PATH,
	);
	const inventory = await readJsonFile(inventoryPath);
	const errors = [];
	const upstreams = Array.isArray(inventory.upstreams) ? inventory.upstreams : [];

	for (const upstream of upstreams) {
		const id = String(upstream.id ?? "").trim() || "<unknown>";
		const categories = Array.isArray(upstream.failureAttributionSignals)
			? upstream.failureAttributionSignals.map((value) => String(value))
			: [];
		if (categories.length === 0) {
			errors.push(`upstream "${id}" must declare failureAttributionSignals categories`);
			continue;
		}
		for (const category of categories) {
			if (!REQUIRED_CATEGORIES.includes(category)) {
				errors.push(`upstream "${id}" uses unsupported failure category "${category}"`);
			}
		}
	}

	const seenCategories = new Set(
		upstreams.flatMap((upstream) =>
			Array.isArray(upstream.failureAttributionSignals)
				? upstream.failureAttributionSignals.map((value) => String(value))
				: [],
		),
	);
	for (const category of REQUIRED_CATEGORIES) {
		if (!seenCategories.has(category)) {
			errors.push(`inventory failure classification is missing required category "${category}"`);
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		inventoryPath: toPosixPath(path.relative(rootDir, inventoryPath)),
		errors,
	};
}

async function main() {
	try {
		const result = await runUpstreamFailureClassificationCheck();
		if (!result.ok) {
			console.error("[upstream-failure-classification] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(`[upstream-failure-classification] OK (${result.inventoryPath})`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[upstream-failure-classification] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runUpstreamFailureClassificationCheck };
