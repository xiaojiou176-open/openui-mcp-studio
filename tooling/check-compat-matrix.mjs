import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_INVENTORY_PATH = "contracts/upstream/inventory.json";
const DEFAULT_MATRIX_PATH = "contracts/upstream/compatibility-matrix.json";

async function runCompatMatrixCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const inventoryPath = path.resolve(
		rootDir,
		options.inventoryPath ?? DEFAULT_INVENTORY_PATH,
	);
	const matrixPath = path.resolve(
		rootDir,
		options.matrixPath ?? DEFAULT_MATRIX_PATH,
	);

	const [inventory, matrix] = await Promise.all([
		readJsonFile(inventoryPath),
		readJsonFile(matrixPath),
	]);

	const errors = [];
	const inventoryIds = new Set(
		(Array.isArray(inventory.upstreams) ? inventory.upstreams : [])
			.map((entry) => String(entry.id ?? "").trim())
			.filter(Boolean),
	);
	const entries = Array.isArray(matrix.entries) ? matrix.entries : [];
	const seenIds = new Set();

	for (const entry of entries) {
		const id = String(entry.id ?? "").trim();
		if (!id) {
			errors.push("compatibility matrix entry is missing id");
			continue;
		}
		if (seenIds.has(id)) {
			errors.push(`compatibility matrix contains duplicate entry "${id}"`);
		}
		seenIds.add(id);

		const upstreamIds = Array.isArray(entry.inventoryIds) ? entry.inventoryIds : [];
		if (upstreamIds.length === 0) {
			errors.push(`compatibility matrix entry "${id}" must reference at least one upstream`);
		}
		for (const upstreamId of upstreamIds) {
			if (!inventoryIds.has(String(upstreamId))) {
				errors.push(
					`compatibility matrix entry "${id}" references unknown upstream "${upstreamId}"`,
				);
			}
		}

		if (!Array.isArray(entry.validatedBy) || entry.validatedBy.length === 0) {
			errors.push(`compatibility matrix entry "${id}" must declare validatedBy commands/tests`);
		}
		for (const requiredField of ["blockingScope", "executionCadence", "owner"]) {
			if (!String(entry[requiredField] ?? "").trim()) {
				errors.push(`compatibility matrix entry "${id}" is missing required field "${requiredField}"`);
			}
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		matrixPath: toPosixPath(path.relative(rootDir, matrixPath)),
		errors,
	};
}

async function main() {
	try {
		const result = await runCompatMatrixCheck();
		if (!result.ok) {
			console.error("[compat-matrix] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(`[compat-matrix] OK (${result.matrixPath})`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[compat-matrix] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runCompatMatrixCheck };
