import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ALLOWLIST_PATH = "tooling/contracts/public-boundary-allowlist.json";

function firstNonAsciiLine(content) {
	const lines = content.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		if ([...lines[index]].some((char) => (char.codePointAt(0) ?? 0) > 0x7f)) {
			return index + 1;
		}
	}
	return null;
}

async function runGovernanceLanguageBoundaryCheck(rootDir = process.cwd()) {
	const absoluteRoot = path.resolve(rootDir);
	const errors = [];
	const raw = await fs.readFile(
		path.resolve(absoluteRoot, DEFAULT_ALLOWLIST_PATH),
		"utf8",
	);
	const contract = JSON.parse(raw);
	const files = Array.isArray(contract?.languageBoundary?.scanPaths)
		? contract.languageBoundary.scanPaths
				.map((value) => String(value ?? "").trim())
				.filter(Boolean)
		: [];
	const allowedNonAsciiPaths = new Set(
		Array.isArray(contract?.languageBoundary?.allowedNonAsciiPaths)
			? contract.languageBoundary.allowedNonAsciiPaths
					.map((value) => String(value ?? "").trim())
					.filter(Boolean)
			: [],
	);

	for (const relativePath of files) {
		const content = await fs.readFile(path.resolve(absoluteRoot, relativePath), "utf8");
		if (allowedNonAsciiPaths.has(relativePath)) {
			continue;
		}
		const lineNumber = firstNonAsciiLine(content);
		if (lineNumber !== null) {
			errors.push(`${relativePath} contains non-ASCII content on line ${lineNumber}`);
		}
	}

	return {
		ok: errors.length === 0,
		errors,
	};
}

async function main() {
	try {
		const result = await runGovernanceLanguageBoundaryCheck();
		if (!result.ok) {
			console.error("[language-boundary] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[language-boundary] OK");
	} catch (error) {
		console.error(
			`[language-boundary] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export { runGovernanceLanguageBoundaryCheck };
