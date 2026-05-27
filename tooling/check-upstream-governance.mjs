import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_INVENTORY_PATH = "contracts/upstream/inventory.json";
const DEFAULT_MATRIX_PATH = "contracts/upstream/compatibility-matrix.json";
const DEFAULT_PATCH_REGISTRY_PATH = "contracts/upstream/patch-registry.json";
const DEFAULT_GLUE_SURFACES_PATH = "contracts/upstream/glue-surfaces.json";
const DEFAULT_ADOPTION_BACKLOG_PATH = "contracts/upstream/adoption-backlog.json";

const ALLOWED_ADOPTION_SHAPES = new Set([
	"selective-port",
	"targeted-adoption",
	"defer",
]);

const ALLOWED_BACKLOG_STATUSES = new Set([
	"planned",
	"in-progress",
	"done",
	"deferred",
	"blocked",
]);

const ALLOWED_BACKLOG_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const DEFAULT_REQUIRED_DONE_FIELDS = [
	"completedAt",
	"sourceCommit",
	"decisionSummary",
	"validationEvidence",
	"rollbackVerified",
];

async function exists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function listPatchFiles(rootDir) {
	try {
		const entries = await fs.readdir(path.join(rootDir, "patches"), {
			withFileTypes: true,
		});
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".patch"))
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
}

async function runUpstreamGovernanceCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const inventoryPath = path.resolve(
		rootDir,
		options.inventoryPath ?? DEFAULT_INVENTORY_PATH,
	);
	const matrixPath = path.resolve(
		rootDir,
		options.matrixPath ?? DEFAULT_MATRIX_PATH,
	);
	const patchRegistryPath = path.resolve(
		rootDir,
		options.patchRegistryPath ?? DEFAULT_PATCH_REGISTRY_PATH,
	);
	const glueSurfacesPath = path.resolve(
		rootDir,
		options.glueSurfacesPath ?? DEFAULT_GLUE_SURFACES_PATH,
	);
	const adoptionBacklogPath = path.resolve(
		rootDir,
		options.adoptionBacklogPath ?? DEFAULT_ADOPTION_BACKLOG_PATH,
	);

	const [inventory, matrix, patchRegistry, glueSurfaces, adoptionBacklog, packageJson] = await Promise.all([
		readJsonFile(inventoryPath),
		readJsonFile(matrixPath),
		readJsonFile(patchRegistryPath),
		readJsonFile(glueSurfacesPath),
		readJsonFile(adoptionBacklogPath),
		readJsonFile(path.resolve(rootDir, "package.json")),
	]);

	const errors = [];
	const upstreams = Array.isArray(inventory.upstreams) ? inventory.upstreams : [];
	const inventoryIds = new Set();
	const glueSurfaceIds = new Set(
		(Array.isArray(glueSurfaces.surfaces) ? glueSurfaces.surfaces : [])
			.map((entry) => String(entry.id ?? "").trim())
			.filter(Boolean),
	);
	for (const upstream of upstreams) {
		const id = String(upstream.id ?? "").trim();
		if (!id) {
			errors.push("inventory contains upstream without id");
			continue;
		}
		if (inventoryIds.has(id)) {
			errors.push(`inventory contains duplicate upstream id "${id}"`);
			continue;
		}
		inventoryIds.add(id);
		for (const requiredField of [
			"sourceLocator",
			"publicContractSurface",
			"supportedVersionWindow",
			"rollbackPath",
			"glueSurfaceId",
		]) {
			if (!String(upstream[requiredField] ?? "").trim()) {
				errors.push(`upstream "${id}" is missing required field "${requiredField}"`);
			}
		}
		const glueSurfaceId = String(upstream.glueSurfaceId ?? "").trim();
		if (glueSurfaceId && !glueSurfaceIds.has(glueSurfaceId)) {
			errors.push(`upstream "${id}" references unknown glue surface "${glueSurfaceId}"`);
		}
		const pinning = upstream.pin ?? {};
		if (pinning.required === true && !String(pinning.mode ?? "").trim()) {
			errors.push(`upstream "${id}" requires pinning metadata`);
		}
		if (!Array.isArray(upstream.validationSuites) || upstream.validationSuites.length === 0) {
			errors.push(`upstream "${id}" must define verification commands or tests`);
		}
	}

	const matrixEntries = Array.isArray(matrix.entries) ? matrix.entries : [];
	for (const entry of matrixEntries) {
		const ids = Array.isArray(entry.inventoryIds) ? entry.inventoryIds : [];
		for (const id of ids) {
			if (!inventoryIds.has(String(id))) {
				errors.push(
					`compatibility matrix entry "${entry.id}" references unknown upstream "${id}"`,
				);
			}
		}
	}

	const backlogEntries = Array.isArray(adoptionBacklog.entries)
		? adoptionBacklog.entries
		: [];
	const requiredDoneFields = Array.isArray(adoptionBacklog.requiredDoneFields)
		? adoptionBacklog.requiredDoneFields
				.map((field) => String(field ?? "").trim())
				.filter(Boolean)
		: DEFAULT_REQUIRED_DONE_FIELDS;
	if (backlogEntries.length === 0) {
		errors.push("adoption backlog must contain at least one entry");
	}

	const backlogIds = new Set();
	const backlogInventoryCoverage = new Set();
	for (const entry of backlogEntries) {
		const id = String(entry.id ?? "").trim();
		if (!id) {
			errors.push("adoption backlog contains entry without id");
			continue;
		}
		if (backlogIds.has(id)) {
			errors.push(`adoption backlog contains duplicate entry id "${id}"`);
			continue;
		}
		backlogIds.add(id);

		const inventoryId = String(entry.inventoryId ?? "").trim();
		if (!inventoryIds.has(inventoryId)) {
			errors.push(`adoption backlog entry "${id}" references unknown upstream "${inventoryId}"`);
		} else {
			backlogInventoryCoverage.add(inventoryId);
		}

		const title = String(entry.title ?? "").trim();
		if (!title) {
			errors.push(`adoption backlog entry "${id}" is missing title`);
		}

		const owner = String(entry.owner ?? "").trim();
		if (!owner) {
			errors.push(`adoption backlog entry "${id}" is missing owner`);
		}

		const adoptionShape = String(entry.adoptionShape ?? "").trim();
		if (!ALLOWED_ADOPTION_SHAPES.has(adoptionShape)) {
			errors.push(
				`adoption backlog entry "${id}" has invalid adoptionShape "${adoptionShape}"`,
			);
		}

		const status = String(entry.status ?? "").trim();
		if (!ALLOWED_BACKLOG_STATUSES.has(status)) {
			errors.push(`adoption backlog entry "${id}" has invalid status "${status}"`);
		}

		const priority = String(entry.priority ?? "").trim();
		if (!ALLOWED_BACKLOG_PRIORITIES.has(priority)) {
			errors.push(`adoption backlog entry "${id}" has invalid priority "${priority}"`);
		}

		for (const requiredField of ["sourceEvidence", "whyNow", "rollbackPath"]) {
			if (!String(entry[requiredField] ?? "").trim()) {
				errors.push(`adoption backlog entry "${id}" is missing "${requiredField}"`);
			}
		}

		const localSurfaces = Array.isArray(entry.localSurfaces) ? entry.localSurfaces : [];
		if (localSurfaces.length === 0) {
			errors.push(`adoption backlog entry "${id}" must list localSurfaces`);
		}
		for (const surface of localSurfaces) {
			const relativeSurface = String(surface ?? "").trim();
			if (!relativeSurface) {
				errors.push(`adoption backlog entry "${id}" contains empty local surface`);
				continue;
			}
			const absoluteSurface = path.resolve(rootDir, relativeSurface);
			if (!(await exists(absoluteSurface))) {
				errors.push(
					`adoption backlog entry "${id}" points to missing local surface "${relativeSurface}"`,
				);
			}
		}

		const validationCommands = Array.isArray(entry.validationCommands)
			? entry.validationCommands
			: [];
		if (validationCommands.length === 0) {
			errors.push(`adoption backlog entry "${id}" must list validationCommands`);
		}
		for (const command of validationCommands) {
			if (!String(command ?? "").trim()) {
				errors.push(`adoption backlog entry "${id}" contains empty validation command`);
			}
		}

		if (status === "done") {
			for (const requiredField of requiredDoneFields) {
				const value = entry[requiredField];
				if (Array.isArray(value)) {
					if (value.length === 0) {
						errors.push(
							`adoption backlog entry "${id}" is missing done-receipt field "${requiredField}"`,
						);
					}
					continue;
				}
				if (typeof value === "boolean") {
					if (requiredField === "rollbackVerified" && value !== true) {
						errors.push(
							`adoption backlog entry "${id}" must set done-receipt field "rollbackVerified" to true`,
						);
					}
					continue;
				}
				if (!String(value ?? "").trim()) {
					errors.push(
						`adoption backlog entry "${id}" is missing done-receipt field "${requiredField}"`,
					);
				}
			}
		}
	}

	if (!backlogInventoryCoverage.has("openui-upstream-reference")) {
		errors.push('adoption backlog must include at least one entry for "openui-upstream-reference"');
	}

	const usesPatchPackage =
		packageJson.dependencies?.["patch-package"] ||
		packageJson.devDependencies?.["patch-package"];
	if (usesPatchPackage && String(patchRegistry.manager ?? "") !== "patch-package") {
		errors.push('patch registry manager must be "patch-package" when patch-package is installed');
	}

	const registeredPatches = new Set(
		(Array.isArray(patchRegistry.patches) ? patchRegistry.patches : []).map(
			(entry) => String(entry.file ?? "").trim(),
		),
	);
	for (const patchFile of await listPatchFiles(rootDir)) {
		if (!registeredPatches.has(patchFile)) {
			errors.push(`patch file "${patchFile}" is missing from patch registry`);
		}
	}

	for (const requiredUpstream of [
		"gemini-api",
		"ghcr-ci-image",
		"playwright-browser-assets",
		"python-sidecar-dependencies",
		"patch-package-surface",
		"upstream-sync-remotes",
	]) {
		if (!inventoryIds.has(requiredUpstream)) {
			errors.push(`inventory is missing required upstream "${requiredUpstream}"`);
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		inventoryPath: toPosixPath(path.relative(rootDir, inventoryPath)),
		matrixPath: toPosixPath(path.relative(rootDir, matrixPath)),
		patchRegistryPath: toPosixPath(path.relative(rootDir, patchRegistryPath)),
		glueSurfacesPath: toPosixPath(path.relative(rootDir, glueSurfacesPath)),
		adoptionBacklogPath: toPosixPath(path.relative(rootDir, adoptionBacklogPath)),
		errors,
	};
}

async function main() {
	try {
		const result = await runUpstreamGovernanceCheck();
		if (!result.ok) {
			globalThis.console.error("[upstream-governance] FAILED");
			for (const error of result.errors) {
				globalThis.console.error(`- ${error}`);
			}
			process.exit(1);
		}
		globalThis.console.log(
			`[upstream-governance] OK (${result.inventoryPath})`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[upstream-governance] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runUpstreamGovernanceCheck };
