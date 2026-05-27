import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_REQUIREMENTS_PATH = "services/gemini-sidecar/requirements.txt";
const DEFAULT_CONSTRAINTS_PATH = "services/gemini-sidecar/constraints.txt";
const SUPPORTED_OPERATORS = ["===", "==", "!=", ">=", "<=", ">", "<", "~="];

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function normalizePackageName(name) {
	return String(name).trim().toLowerCase().replace(/[-_.]+/gu, "-");
}

function trimInlineComment(line) {
	return line.replace(/\s+#.*$/u, "").trim();
}

function tokenizeVersion(version) {
	return String(version)
		.toLowerCase()
		.match(/\d+|[a-z]+/gu) ?? [];
}

function compareVersions(left, right) {
	const leftTokens = tokenizeVersion(left);
	const rightTokens = tokenizeVersion(right);
	const length = Math.max(leftTokens.length, rightTokens.length);

	for (let index = 0; index < length; index += 1) {
		const leftToken = leftTokens[index];
		const rightToken = rightTokens[index];

		if (leftToken === rightToken) {
			continue;
		}

		if (leftToken === undefined) {
			return /^0+$/u.test(rightToken ?? "") ? 0 : -1;
		}
		if (rightToken === undefined) {
			return /^0+$/u.test(leftToken) ? 0 : 1;
		}

		const leftNumber = /^\d+$/u.test(leftToken);
		const rightNumber = /^\d+$/u.test(rightToken);

		if (leftNumber && rightNumber) {
			const difference = Number(leftToken) - Number(rightToken);
			if (difference !== 0) {
				return difference > 0 ? 1 : -1;
			}
			continue;
		}

		if (leftNumber !== rightNumber) {
			return leftNumber ? 1 : -1;
		}

		const difference = leftToken.localeCompare(rightToken);
		if (difference !== 0) {
			return difference > 0 ? 1 : -1;
		}
	}

	return 0;
}

function splitVersionSegments(version) {
	return String(version)
		.split(".")
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function compatibleUpperBound(version) {
	const segments = splitVersionSegments(version);
	if (segments.length === 0 || segments.some((segment) => !/^\d+$/u.test(segment))) {
		return null;
	}

	const numericSegments = segments.map((segment) => Number(segment));
	const upperIndex = numericSegments.length === 1 ? 0 : numericSegments.length - 2;
	const upperSegments = numericSegments.slice(0, upperIndex + 1);
	upperSegments[upperIndex] += 1;
	return upperSegments.join(".");
}

function parseSpecifier(rawSpecifier) {
	const value = rawSpecifier.trim();
	for (const operator of SUPPORTED_OPERATORS) {
		if (value.startsWith(operator)) {
			return {
				operator,
				version: value.slice(operator.length).trim(),
			};
		}
	}

	return null;
}

function satisfiesSpecifier(version, rawSpecifier) {
	const specifier = parseSpecifier(rawSpecifier);
	if (!specifier || !specifier.version) {
		return {
			ok: false,
			error: `unsupported specifier "${rawSpecifier}"`,
		};
	}

	const comparison = compareVersions(version, specifier.version);
	switch (specifier.operator) {
		case "===":
		case "==":
			return { ok: comparison === 0 };
		case "!=":
			return { ok: comparison !== 0 };
		case ">":
			return { ok: comparison > 0 };
		case ">=":
			return { ok: comparison >= 0 };
		case "<":
			return { ok: comparison < 0 };
		case "<=":
			return { ok: comparison <= 0 };
		case "~=": {
			const upperBound = compatibleUpperBound(specifier.version);
			if (!upperBound) {
				return {
					ok: false,
					error: `unsupported ~= specifier "${rawSpecifier}"`,
				};
			}
			return {
				ok:
					compareVersions(version, specifier.version) >= 0 &&
					compareVersions(version, upperBound) < 0,
			};
		}
		default:
			return {
				ok: false,
				error: `unsupported operator "${specifier.operator}"`,
			};
	}
}

function parseDirectRequirement(line, lineNumber, errors, requirementsPath) {
	const cleaned = trimInlineComment(line);
	if (!cleaned) {
		return null;
	}

	if (cleaned.startsWith("-")) {
		return null;
	}

	const match = cleaned.match(/^([A-Za-z0-9_.-]+)\s*(.*)$/u);
	if (!match) {
		errors.push(
			`${requirementsPath}:${lineNumber} contains an unsupported requirement line "${cleaned}".`,
		);
		return null;
	}

	const [, rawName, rawSpecifiers] = match;
	const specifiers = rawSpecifiers
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);

	for (const specifier of specifiers) {
		if (!parseSpecifier(specifier)) {
			errors.push(
				`${requirementsPath}:${lineNumber} contains unsupported specifier "${specifier}".`,
			);
		}
	}

	return {
		name: rawName,
		normalizedName: normalizePackageName(rawName),
		specifiers,
		specifierText: rawSpecifiers.trim(),
		lineNumber,
	};
}

function parseRequirementMetadata(rawRequirements, requirementsPath, errors) {
	const directRequirements = [];
	const constraintRefs = [];
	const seenNames = new Set();
	const relativeRequirementsPath = toPosixPath(requirementsPath);
	const lines = rawRequirements.split(/\r?\n/gu);

	for (const [index, rawLine] of lines.entries()) {
		const lineNumber = index + 1;
		const cleaned = trimInlineComment(rawLine);
		if (!cleaned) {
			continue;
		}
		if (cleaned.startsWith("-c ") || cleaned.startsWith("--constraint ")) {
			const value = cleaned
				.replace(/^--constraint\s+/u, "")
				.replace(/^-c\s+/u, "")
				.trim();
			if (!value) {
				errors.push(
					`${relativeRequirementsPath}:${lineNumber} must declare a non-empty constraints path.`,
				);
				continue;
			}
			constraintRefs.push(value);
			continue;
		}

		const parsed = parseDirectRequirement(
			cleaned,
			lineNumber,
			errors,
			relativeRequirementsPath,
		);
		if (!parsed) {
			continue;
		}

		if (seenNames.has(parsed.normalizedName)) {
			errors.push(
				`${relativeRequirementsPath}:${lineNumber} duplicates direct requirement "${parsed.name}".`,
			);
			continue;
		}
		seenNames.add(parsed.normalizedName);
		directRequirements.push(parsed);
	}

	return { directRequirements, constraintRefs };
}

function parseConstraintEntries(rawConstraints, constraintsPath, errors) {
	const entries = [];
	const seenNames = new Set();
	const relativeConstraintsPath = toPosixPath(constraintsPath);
	const lines = rawConstraints.split(/\r?\n/gu);

	for (const [index, rawLine] of lines.entries()) {
		const lineNumber = index + 1;
		const cleaned = trimInlineComment(rawLine);
		if (!cleaned) {
			continue;
		}
		if (cleaned.startsWith("#")) {
			continue;
		}
		if (cleaned.startsWith("-")) {
			errors.push(
				`${relativeConstraintsPath}:${lineNumber} must use exact package pins, not option lines.`,
			);
			continue;
		}

		const match = cleaned.match(/^([A-Za-z0-9_.-]+)==([^\s;]+)(?:\s*;.*)?$/u);
		if (!match) {
			errors.push(
				`${relativeConstraintsPath}:${lineNumber} must use exact "name==version" pins.`,
			);
			continue;
		}

		const [, rawName, version] = match;
		const normalizedName = normalizePackageName(rawName);
		if (seenNames.has(normalizedName)) {
			errors.push(
				`${relativeConstraintsPath}:${lineNumber} duplicates constraint "${rawName}".`,
			);
			continue;
		}
		seenNames.add(normalizedName);
		entries.push({
			name: rawName,
			normalizedName,
			version,
			lineNumber,
		});
	}

	return entries;
}

async function checkPythonSidecarLock(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const requirementsPath = path.resolve(
		rootDir,
		options.requirementsPath ?? DEFAULT_REQUIREMENTS_PATH,
	);
	const constraintsPath = path.resolve(
		rootDir,
		options.constraintsPath ?? DEFAULT_CONSTRAINTS_PATH,
	);
	const errors = [];
	const expectedConstraintRef = path.relative(
		path.dirname(requirementsPath),
		constraintsPath,
	);

	const [rawRequirements, rawConstraints] = await Promise.all([
		fs.readFile(requirementsPath, "utf8"),
		fs.readFile(constraintsPath, "utf8"),
	]);

	const { directRequirements, constraintRefs } = parseRequirementMetadata(
		rawRequirements,
		requirementsPath,
		errors,
	);
	const constraints = parseConstraintEntries(
		rawConstraints,
		constraintsPath,
		errors,
	);
	const constraintsByName = new Map(
		constraints.map((entry) => [entry.normalizedName, entry]),
	);
	const normalizedExpectedRef = toPosixPath(expectedConstraintRef);
	const normalizedRefs = constraintRefs.map((ref) => toPosixPath(ref));

	if (!normalizedRefs.includes(normalizedExpectedRef)) {
		errors.push(
			`${toPosixPath(requirementsPath)} must include "-c ${normalizedExpectedRef}" so installs consume the locked sidecar resolution.`,
		);
	}

	for (const requirement of directRequirements) {
		const pinned = constraintsByName.get(requirement.normalizedName);
		if (!pinned) {
			errors.push(
				`direct requirement "${requirement.name}" is missing from ${path.basename(constraintsPath)}.`,
			);
			continue;
		}

		for (const specifier of requirement.specifiers) {
			const result = satisfiesSpecifier(pinned.version, specifier);
			if (result.error) {
				errors.push(
					`${toPosixPath(requirementsPath)}:${requirement.lineNumber} ${result.error}.`,
				);
				continue;
			}
			if (!result.ok) {
				errors.push(
					`direct requirement "${requirement.name}" allows "${requirement.specifierText}" but ${path.basename(constraintsPath)} pins "${pinned.version}".`,
				);
			}
		}
	}

	return {
		ok: errors.length === 0,
		errors,
		directRequirements,
		constraints,
		constraintRefs,
		requirementsPath,
		constraintsPath,
	};
}

async function main() {
	try {
		const result = await checkPythonSidecarLock();
		if (!result.ok) {
			console.error("[python-sidecar-lock] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}

		console.log(
			`[python-sidecar-lock] OK (${result.directRequirements.length} direct requirements, ${result.constraints.length} pinned packages)`,
		);
	} catch (error) {
		console.error(
			`[python-sidecar-lock] ERROR: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { checkPythonSidecarLock };
