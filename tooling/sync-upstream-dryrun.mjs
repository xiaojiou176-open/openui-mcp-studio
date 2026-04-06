import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_UPSTREAM_URL = "https://github.com/wandb/openui.git";

function runGit(args, options = {}) {
	const result = spawnSync("git", args, {
		cwd: options.cwd ?? process.cwd(),
		encoding: "utf8",
	});

	if (result.error) {
		throw result.error;
	}

	const status = typeof result.status === "number" ? result.status : 1;
	const stdout = (result.stdout ?? "").trim();
	const stderr = (result.stderr ?? "").trim();

	if (status !== 0 && !options.allowFailure) {
		throw new Error(
			`git ${args.join(" ")} failed: ${stderr || `exit ${status}`}`,
		);
	}

	return { status, stdout };
}

function detectContext(cwd) {
	runGit(["rev-parse", "--is-inside-work-tree"], { cwd });

	const remotesOutput = runGit(["remote"], { cwd, allowFailure: true }).stdout;
	const remotes = new Set(
		remotesOutput
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean),
	);

	const currentBranch = runGit(["branch", "--show-current"], {
		cwd,
		allowFailure: true,
	}).stdout;
	const dateToken = new Date().toISOString().slice(0, 10).replaceAll("-", "");

	return {
		cwd,
		hasOrigin: remotes.has("origin"),
		hasUpstream: remotes.has("upstream"),
		currentBranch: currentBranch || "(detached)",
		recommendedBranch: `chore/upstream-sync-${dateToken}`,
	};
}

function printStep(stepNumber, title, commands, onFailure) {
	process.stdout.write(`Step ${stepNumber}: ${title}\n`);
	for (const [index, command] of commands.entries()) {
		process.stdout.write(`  [${stepNumber}.${index + 1}] ${command}\n`);
	}
	if (onFailure) {
		process.stdout.write(`  If failed: ${onFailure}\n`);
	}
	process.stdout.write("\n");
}

function printDryRun(context) {
	process.stdout.write("Upstream sync dry run (no commands executed)\n");
	process.stdout.write(`Working directory: ${context.cwd}\n`);
	process.stdout.write(`Current branch: ${context.currentBranch}\n`);
	process.stdout.write(
		`Recommended sync branch: ${context.recommendedBranch}\n\n`,
	);

	const preflightCommands = [
		"node tooling/sync-upstream-check.mjs --mode=blocking",
	];
	if (!context.hasOrigin) {
		preflightCommands.push("git remote add origin <fork-repo-url>");
	}
	if (!context.hasUpstream) {
		preflightCommands.push(`git remote add upstream ${DEFAULT_UPSTREAM_URL}`);
	}
	preflightCommands.push(
		"node tooling/sync-upstream-check.mjs --mode=non-blocking # optional risk-accepted preview",
	);

	printStep(
		0,
		"Preflight",
		preflightCommands,
		"Complete each fix command, then rerun step 0 until blocking check exits with code 0.",
	);

	printStep(
		1,
		"Fetch and branch setup",
		[
			"git fetch origin --prune --tags",
			"git fetch upstream --prune --tags",
			"npm run security:history:audit # required after fetching upstream to catch reintroduced upstream-side history",
			"git switch main",
			"git pull --ff-only origin main",
			`git switch -c ${context.recommendedBranch}`,
			`git push -u origin ${context.recommendedBranch}`,
		],
		"Re-sync local main with origin/main, recreate sync branch from clean main, and retry.",
	);

	printStep(
		2,
		"Selective port default (targeted adoption when needed)",
		[
			"Review upstream release notes, target tag/commit, and affected subsystem before changing code",
			"Port only the needed change set into this repo",
			"Use targeted adoption only when the change spans a subsystem and still fits local repository boundaries",
			"# whole-repo merge/rebase is exceptional only; document why selective port is not realistic before considering it",
		],
		"Stop and narrow the adoption surface; if a broad sync still seems necessary, document why selective port is not realistic before escalating to an exceptional whole-repo merge/rebase path.",
	);

	printStep(
		3,
		"Replay local patches",
		[
			"git log --oneline --reverse <sync-base>..main",
			"git cherry-pick <commit-sha-1>",
			"git cherry-pick <commit-sha-2>",
			"# skip patch if upstream already contains equivalent change",
		],
		"Abort the current cherry-pick (git cherry-pick --abort), document the conflict, and replay only business-critical patches.",
	);

	printStep(
		4,
		"Full regression",
		[
			"npm run lint",
			"npm run typecheck",
			"npm run test",
			"npm run build",
			"npm run ci:gate",
		],
		"Stop PR creation, fix regressions, and rerun step 4 until all commands pass.",
	);

	printStep(
		5,
		"PR evidence package",
		[
			"Record release note URL + upstream tag/commit SHA",
			"Document conflict files, resolutions, and risk notes",
			"Attach validation summary and rollback steps",
		],
		"Do not open/merge PR until all evidence fields are complete and reproducible.",
	);
}

function isDirectExecution() {
	if (!process.argv[1]) {
		return false;
	}
	return pathToFileURL(process.argv[1]).href === import.meta.url;
}

function main() {
	try {
		const context = detectContext(process.cwd());
		printDryRun(context);
		process.exitCode = 0;
	} catch (error) {
		process.stderr.write(
			`sync-upstream-dryrun runtime error: ${
				error instanceof Error ? error.message : String(error)
			}\n`,
		);
		process.exitCode = 2;
	}
}

if (isDirectExecution()) {
	main();
}

export { detectContext, printDryRun };
