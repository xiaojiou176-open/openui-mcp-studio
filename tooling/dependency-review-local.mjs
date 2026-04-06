#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";

function runGit(args) {
	return execFileSync("git", args, {
		cwd: process.cwd(),
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function resolveBaseRef() {
	for (const candidate of ["origin/main", "main"]) {
		try {
			runGit(["rev-parse", "--verify", candidate]);
			return candidate;
		} catch {
			// Try next candidate.
		}
	}
	throw new Error(
		"dependency-review-local: could not resolve base ref (expected origin/main or main)",
	);
}

function parseChangedFiles(mergeBase, headRef) {
	const raw = runGit(["diff", "--name-only", `${mergeBase}...${headRef}`]);
	return raw ? raw.split("\n").filter(Boolean) : [];
}

function readDiff(mergeBase, headRef, filePath) {
	return runGit(["diff", "--unified=0", `${mergeBase}...${headRef}`, "--", filePath]);
}

function isDependencyRelevantPackageJson(diffText) {
	return /^[+-]\s*"(?:(?:dev|peer|optional)?dependencies|bundledDependencies|overrides|resolutions|packageManager)"\s*:/mu.test(
		diffText,
	);
}

function main() {
	const headRef = process.env.OPENUI_DEP_REVIEW_HEAD?.trim() || "HEAD";
	const baseRef = process.env.OPENUI_DEP_REVIEW_BASE?.trim() || resolveBaseRef();
	const mergeBase = runGit(["merge-base", baseRef, headRef]);
	const changedFiles = parseChangedFiles(mergeBase, headRef);
	const relevant = [];

	for (const filePath of changedFiles) {
		if (/package-lock\.json$/u.test(filePath)) {
			relevant.push({ filePath, ecosystem: "npm" });
			continue;
		}
		if (/package\.json$/u.test(filePath)) {
			const diffText = readDiff(mergeBase, headRef, filePath);
			if (isDependencyRelevantPackageJson(diffText)) {
				relevant.push({ filePath, ecosystem: "npm" });
			}
			continue;
		}
		if (/(^|\/)(requirements|constraints).*\.txt$/u.test(filePath)) {
			relevant.push({ filePath, ecosystem: "python" });
		}
	}

	if (relevant.length === 0) {
		console.log(
			"dependency-review-local: no dependency manifest delta detected; skipping",
		);
		return;
	}

	console.log(
		`dependency-review-local: relevant dependency deltas detected -> ${relevant
			.map((entry) => entry.filePath)
			.join(", ")}`,
	);

	if (relevant.some((entry) => entry.ecosystem === "npm")) {
		const audit = spawnSync(
			"npm",
			["audit", "--audit-level=high", "--package-lock-only"],
			{
				cwd: process.cwd(),
				stdio: "inherit",
			},
		);
		if ((audit.status ?? 1) !== 0) {
			process.exit(audit.status ?? 1);
		}
	}

	if (relevant.some((entry) => entry.ecosystem === "python")) {
		console.log(
			"dependency-review-local: python dependency delta detected; GitHub Dependency Review workflow remains the authoritative PR gate for the final dependency graph verdict",
		);
	}

	console.log("dependency-review-local: OK");
}

try {
	main();
} catch (error) {
	console.error(
		error instanceof Error
			? error.message
			: `dependency-review-local: ${String(error)}`,
	);
	process.exit(1);
}
