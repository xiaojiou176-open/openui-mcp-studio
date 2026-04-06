import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CODE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".mts",
	".cts",
]);

function toPosixPath(value) {
	return value.split(path.sep).join("/");
}

function escapeRegExp(value) {
	return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern) {
	let source = "^";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		if (char === "*") {
			const nextChar = pattern[index + 1];
			if (nextChar === "*") {
				source += ".*";
				index += 1;
			} else {
				source += "[^/]*";
			}
			continue;
		}
		if (char === "?") {
			source += ".";
			continue;
		}
		source += escapeRegExp(char);
	}
	source += "$";
	return new RegExp(source);
}

function createGlobMatcher(patterns) {
	const expressions = (Array.isArray(patterns) ? patterns : [])
		.map((pattern) => String(pattern ?? "").trim())
		.filter(Boolean)
		.map((pattern) => globToRegExp(toPosixPath(pattern)));

	return (value) => {
		const candidate = toPosixPath(String(value ?? ""));
		return expressions.some((expression) => expression.test(candidate));
	};
}

async function readJsonFile(filePath) {
	const raw = await fs.readFile(filePath, "utf8");
	return JSON.parse(raw);
}

async function pathExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function isPathOutsideRoot(rootPath, candidatePath) {
	const relativePath = path.relative(rootPath, candidatePath);
	return relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

function isSafeRelativePath(filePath) {
	if (!filePath || path.isAbsolute(filePath)) {
		return false;
	}
	return !String(filePath).split(/[\\/]/u).includes("..");
}

async function collectCodeFiles(rootDir, projectRoot, options = {}) {
	const excludeMatcher = createGlobMatcher(options.excludePatterns ?? []);
	const codeExtensions =
		options.codeExtensions instanceof Set
			? options.codeExtensions
			: DEFAULT_CODE_EXTENSIONS;

	let entries;
	try {
		entries = await fs.readdir(rootDir, { withFileTypes: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}

	const files = [];
	for (const entry of entries) {
		const absolutePath = path.join(rootDir, entry.name);
		const relativePath = toPosixPath(path.relative(projectRoot, absolutePath));

		if (excludeMatcher(relativePath)) {
			continue;
		}

		if (entry.isDirectory()) {
			files.push(
				...(await collectCodeFiles(absolutePath, projectRoot, options)),
			);
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		if (!codeExtensions.has(path.extname(entry.name).toLowerCase())) {
			continue;
		}

		files.push(absolutePath);
	}

	return files;
}

function extractModuleSpecifiers(sourceText) {
	const matches = new Set();
	const patterns = [
		/\bimport\s+[^"'`]*?\s+from\s+["'`]([^"'`]+)["'`]/g,
		/\bexport\s+[^"'`]*?\s+from\s+["'`]([^"'`]+)["'`]/g,
		/\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
		/\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
	];

	for (const pattern of patterns) {
		for (const match of sourceText.matchAll(pattern)) {
			const specifier = match[1]?.trim();
			if (specifier) {
				matches.add(specifier);
			}
		}
	}

	return Array.from(matches);
}

function resolveRelativeImportCandidate(fromFile, specifier) {
	const resolved = path.resolve(path.dirname(fromFile), specifier);
	const extension = path.extname(specifier).toLowerCase();
	const extensionlessResolved =
		extension === ".js" ||
		extension === ".jsx" ||
		extension === ".mjs" ||
		extension === ".cjs"
			? resolved.slice(0, -extension.length)
			: resolved;
	const candidates = [
		resolved,
		extensionlessResolved,
		`${resolved}.ts`,
		`${resolved}.tsx`,
		`${resolved}.js`,
		`${resolved}.jsx`,
		`${resolved}.mjs`,
		`${resolved}.cjs`,
		`${extensionlessResolved}.ts`,
		`${extensionlessResolved}.tsx`,
		`${extensionlessResolved}.js`,
		`${extensionlessResolved}.jsx`,
		`${extensionlessResolved}.mjs`,
		`${extensionlessResolved}.cjs`,
		path.join(resolved, "index.ts"),
		path.join(resolved, "index.tsx"),
		path.join(resolved, "index.js"),
		path.join(resolved, "index.mjs"),
		path.join(extensionlessResolved, "index.ts"),
		path.join(extensionlessResolved, "index.tsx"),
		path.join(extensionlessResolved, "index.js"),
		path.join(extensionlessResolved, "index.mjs"),
	];
	return candidates;
}

async function resolveImportToRepoPath(fromFile, specifier, projectRoot) {
	if (!specifier.startsWith(".")) {
		return null;
	}

	for (const candidate of resolveRelativeImportCandidate(fromFile, specifier)) {
		if (!(await pathExists(candidate))) {
			continue;
		}
		const relativePath = toPosixPath(path.relative(projectRoot, candidate));
		if (isPathOutsideRoot(projectRoot, candidate)) {
			return null;
		}
		return relativePath;
	}

	return null;
}

export {
	DEFAULT_CODE_EXTENSIONS,
	collectCodeFiles,
	createGlobMatcher,
	extractModuleSpecifiers,
	globToRegExp,
	isPathOutsideRoot,
	isSafeRelativePath,
	pathExists,
	readJsonFile,
	resolveImportToRepoPath,
	toPosixPath,
};
