import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildChildEnvFromAllowlist } from "./shared/child-env.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function readPackageJson() {
	const packageJsonPath = path.join(projectRoot, "package.json");
	const packageJsonRaw = fs.readFileSync(packageJsonPath, "utf8");
	return JSON.parse(packageJsonRaw);
}

function createDependencyTypeMap(packageJson) {
	const sections = [
		["dependencies", packageJson.dependencies],
		["devDependencies", packageJson.devDependencies],
		["optionalDependencies", packageJson.optionalDependencies],
		["peerDependencies", packageJson.peerDependencies],
	];

	return sections.reduce((map, [sectionName, sectionDeps]) => {
		if (!sectionDeps || typeof sectionDeps !== "object") {
			return map;
		}

		for (const packageName of Object.keys(sectionDeps)) {
			map.set(packageName, sectionName);
		}

		return map;
	}, new Map());
}

function parseOutdatedJson(stdout) {
	const trimmed = stdout.trim();
	if (!trimmed) {
		return {};
	}

	return JSON.parse(trimmed);
}

function normalizeOutdated(outdatedRaw, dependencyTypeMap) {
	return Object.entries(outdatedRaw)
		.map(([name, value]) => {
			const info = value && typeof value === "object" ? value : {};

			return {
				name,
				dependencyType: dependencyTypeMap.get(name) ?? info.type ?? "unknown",
				current: info.current ?? null,
				wanted: info.wanted ?? null,
				latest: info.latest ?? null,
				location: info.location ?? null,
				dependent: info.dependent ?? null,
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

function runOutdated() {
	const childEnv = buildChildEnvFromAllowlist();
	return spawnSync("npm", ["outdated", "--json", "--long"], {
		cwd: projectRoot,
		encoding: "utf8",
		env: childEnv,
		shell: process.platform === "win32",
	});
}

function printJson(payload) {
	process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
	const packageJson = readPackageJson();
	const dependencyTypeMap = createDependencyTypeMap(packageJson);
	const result = runOutdated();

	if (result.error) {
		printJson({
			ok: false,
			generatedAt: new Date().toISOString(),
			command: "npm outdated --json --long",
			error: result.error.message,
		});
		process.exitCode = 1;
		return;
	}

	if (result.status !== 0 && result.status !== 1) {
		printJson({
			ok: false,
			generatedAt: new Date().toISOString(),
			command: "npm outdated --json --long",
			status: result.status,
			stderr: result.stderr?.trim() || null,
		});
		process.exitCode = 1;
		return;
	}

	try {
		const outdatedRaw = parseOutdatedJson(result.stdout || "");
		const packages = normalizeOutdated(outdatedRaw, dependencyTypeMap);

		printJson({
			ok: true,
			generatedAt: new Date().toISOString(),
			command: "npm outdated --json --long",
			total: packages.length,
			packages,
			stderr: result.stderr?.trim() || null,
		});

		process.exitCode = 0;
	} catch (error) {
		printJson({
			ok: false,
			generatedAt: new Date().toISOString(),
			command: "npm outdated --json --long",
			parseError: error instanceof Error ? error.message : String(error),
			rawStdout: result.stdout || "",
			stderr: result.stderr?.trim() || null,
		});
		process.exitCode = 1;
	}
}

main();
