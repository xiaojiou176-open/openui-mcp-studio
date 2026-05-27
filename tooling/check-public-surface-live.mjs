#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CONTRACT_PATH = "tooling/contracts/public-surface.contract.json";

function readString(value) {
	return typeof value === "string" ? value.trim() : "";
}

function runGh(args) {
	return execFileSync("gh", args, {
		cwd: process.cwd(),
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function runGhJson(args) {
	return JSON.parse(runGh(args));
}

async function loadContract() {
	const raw = await fs.readFile(path.resolve(process.cwd(), CONTRACT_PATH), "utf8");
	return JSON.parse(raw);
}

async function loadDiscussionSnapshot(owner, name, afterCursor) {
	const query = `query($owner:String!, $name:String!, $after:String) {
  repository(owner:$owner, name:$name) {
    discussionCategories(first: 20) {
      nodes { name }
    }
    discussions(first: 100, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { title category { name } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
	const args = [
		"api",
		"graphql",
		"-f",
		`query=${query}`,
		"-F",
		`owner=${owner}`,
		"-F",
		`name=${name}`,
	];
	if (afterCursor) {
		args.push("-F", `after=${afterCursor}`);
	}
	return runGhJson(args);
}

async function runPublicSurfaceLiveCheck() {
	const contract = await loadContract();
	const owner = readString(contract?.repository?.owner);
	const name = readString(contract?.repository?.name);
	const repoRef = `${owner}/${name}`;
	const errors = [];

	const repoView = runGhJson([
		"repo",
		"view",
		repoRef,
		"--json",
		"description,homepageUrl,repositoryTopics,hasDiscussionsEnabled",
	]);

	if (readString(repoView.description) !== readString(contract?.about?.description)) {
		errors.push("repository description does not match public-surface contract.");
	}
	if (readString(repoView.homepageUrl) !== readString(contract?.about?.homepageUrl)) {
		errors.push("repository homepageUrl does not match public-surface contract.");
	}
	if (Boolean(repoView.hasDiscussionsEnabled) !== Boolean(contract?.about?.discussionsEnabled)) {
		errors.push("repository discussionsEnabled state does not match public-surface contract.");
	}

	const actualTopics = new Set(
		Array.isArray(repoView.repositoryTopics)
			? repoView.repositoryTopics
					.map((topic) => readString(topic?.name))
					.filter(Boolean)
			: [],
	);
	for (const topic of Array.isArray(contract?.topics) ? contract.topics : []) {
		if (!actualTopics.has(readString(topic))) {
			errors.push(`missing required repository topic "${topic}".`);
		}
	}

	const requiredDiscussionTitles = new Set(
		Array.isArray(contract?.requiredDiscussionTitles)
			? contract.requiredDiscussionTitles.map((title) => readString(title)).filter(Boolean)
			: [],
	);
	const discussionTitles = new Set();
	let categories = new Set();
	let afterCursor = "";
	let hasNextPage = true;

	while (hasNextPage) {
		const discussionsData = await loadDiscussionSnapshot(owner, name, afterCursor);
		if (categories.size === 0) {
			categories = new Set(
				discussionsData?.data?.repository?.discussionCategories?.nodes?.map((node) =>
					readString(node?.name),
				) ?? [],
			);
		}

		for (const node of discussionsData?.data?.repository?.discussions?.nodes ?? []) {
			const title = readString(node?.title);
			if (title) {
				discussionTitles.add(title);
			}
		}

		const pageInfo = discussionsData?.data?.repository?.discussions?.pageInfo;
		hasNextPage =
			Boolean(pageInfo?.hasNextPage) &&
			![...requiredDiscussionTitles].every((title) => discussionTitles.has(title));
		afterCursor = readString(pageInfo?.endCursor);
		if (!afterCursor) {
			hasNextPage = false;
		}
	}

	for (const category of Array.isArray(contract?.discussionCategories)
		? contract.discussionCategories
		: []) {
		if (!categories.has(readString(category))) {
			errors.push(`missing required discussion category "${category}".`);
		}
	}

	for (const title of requiredDiscussionTitles) {
		if (!discussionTitles.has(readString(title))) {
			errors.push(`missing required discussion thread "${title}".`);
		}
	}

	const release = runGhJson([
		"release",
		"view",
		"--repo",
		repoRef,
		"--json",
		"assets,tagName,name,url",
	]);

	const releaseAssets = new Set(
		Array.isArray(release.assets)
			? release.assets.map((asset) => readString(asset?.name)).filter(Boolean)
			: [],
	);
	for (const assetName of Array.isArray(contract?.release?.requiredAssets)
		? contract.release.requiredAssets
		: []) {
		if (!releaseAssets.has(readString(assetName))) {
			errors.push(`latest release is missing required asset "${assetName}".`);
		}
	}

	return {
		ok: errors.length === 0,
		errors,
		repoRef,
		releaseTag: readString(release.tagName),
	};
}

async function main() {
	try {
		const result = await runPublicSurfaceLiveCheck();
		if (!result.ok) {
			console.error("[public-surface-live] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(
			`[public-surface-live] OK (${result.repoRef}; latest=${result.releaseTag})`,
		);
	} catch (error) {
		console.error(
			`[public-surface-live] ERROR: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

main();
