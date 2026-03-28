import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_PATCH_REGISTRY_PATH = "contracts/upstream/patch-registry.json";

async function listPatchFiles(rootDir, patchDirectory) {
	const entries = await fs.readdir(path.join(rootDir, patchDirectory), {
		withFileTypes: true,
	});
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".patch"))
		.map((entry) => entry.name)
		.sort();
}

async function runPatchRegistryCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const registryPath = path.resolve(
		rootDir,
		options.patchRegistryPath ?? DEFAULT_PATCH_REGISTRY_PATH,
	);
	const registry = await readJsonFile(registryPath);
	const errors = [];

	if (String(registry.manager ?? "") !== "patch-package") {
		errors.push('patch registry manager must be "patch-package"');
	}
	const patchDirectory = String(registry.patchDirectory ?? "").trim();
	if (!patchDirectory) {
		errors.push('patch registry must declare non-empty "patchDirectory"');
	}
	const patchDirectoryPath = patchDirectory
		? path.join(rootDir, patchDirectory)
		: "";

	const requiredFields = Array.isArray(registry.requiredFields)
		? registry.requiredFields.map((value) => String(value))
		: [];
	const patches = Array.isArray(registry.patches) ? registry.patches : [];
	const patchFiles = [];
	if (patchDirectoryPath) {
		try {
			const patchDirectoryStat = await fs.stat(patchDirectoryPath);
			if (!patchDirectoryStat.isDirectory()) {
				errors.push(
					`patch directory "${patchDirectory}" must exist and be a directory`,
				);
			} else {
				patchFiles.push(...(await listPatchFiles(rootDir, patchDirectory)));
			}
		} catch (error) {
			const errorCode =
				error && typeof error === "object" && "code" in error
					? error.code
					: undefined;
			if (errorCode === "ENOENT") {
				errors.push(
					`patch directory "${patchDirectory}" must exist and be a directory`,
				);
			} else {
				throw error;
			}
		}
	}
	const registeredFiles = new Set();

	for (const entry of patches) {
		const file = String(entry.file ?? "").trim();
		if (!file) {
			errors.push("patch registry entry is missing file");
			continue;
		}
		registeredFiles.add(file);
		for (const field of requiredFields) {
			if (!String(entry[field] ?? "").trim()) {
				errors.push(`patch registry entry "${file}" is missing required field "${field}"`);
			}
		}
	}

	for (const patchFile of patchFiles) {
		if (!registeredFiles.has(patchFile)) {
			errors.push(`patch file "${patchFile}" is missing from patch registry`);
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		registryPath: toPosixPath(path.relative(rootDir, registryPath)),
		patchDirectory: patchDirectoryPath ? toPosixPath(patchDirectoryPath) : "",
		errors,
	};
}

async function main() {
	try {
		const result = await runPatchRegistryCheck();
		if (!result.ok) {
			console.error("[patch-registry] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(
			`[patch-registry] OK (${result.registryPath}; patchDirectory=${toPosixPath(path.relative(result.rootDir, result.patchDirectory || "")) || "n/a"})`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[patch-registry] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runPatchRegistryCheck };
