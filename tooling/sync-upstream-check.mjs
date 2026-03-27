import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const EXIT_OK = 0;
const EXIT_POLICY_FAIL = 1;
const EXIT_RUNTIME_ERROR = 2;
const MODE_BLOCKING = "blocking";
const MODE_NON_BLOCKING = "non-blocking";

const SYNC_BRANCH_PATTERN = /^chore\/upstream-sync-\d{8}$/u;
const PROTECTED_BRANCHES = new Set(["main", "master"]);
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

	return { status, stdout, stderr };
}

function listRemotes(cwd) {
	const { stdout } = runGit(["remote"], { cwd });
	if (!stdout) {
		return new Set();
	}
	return new Set(
		stdout
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean),
	);
}

function getCurrentBranch(cwd) {
	const branch = runGit(["branch", "--show-current"], {
		cwd,
		allowFailure: true,
	});
	return branch.stdout.trim();
}

function getTrackingBranch(cwd) {
	const tracking = runGit(
		["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
		{
			cwd,
			allowFailure: true,
		},
	);
	if (tracking.status !== 0) {
		return "";
	}
	return tracking.stdout.trim();
}

function hasRemoteBranch(cwd, remoteName) {
	const probe = runGit(
		["show-ref", "--verify", "--quiet", `refs/remotes/${remoteName}/main`],
		{
			cwd,
			allowFailure: true,
		},
	);
	return probe.status === 0;
}

function makeCheck(id, passed, detail, fix) {
	return { id, passed, detail, fix };
}

function parseCliArgs(argv) {
	let mode = MODE_BLOCKING;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--non-blocking") {
			mode = MODE_NON_BLOCKING;
			continue;
		}
		if (argument === "--mode") {
			const nextValue = argv[index + 1];
			if (!nextValue) {
				throw new Error("--mode requires a value: blocking or non-blocking");
			}
			mode = nextValue;
			index += 1;
			continue;
		}
		if (argument.startsWith("--mode=")) {
			mode = argument.slice("--mode=".length);
			continue;
		}
		throw new Error(`unknown argument: ${argument}`);
	}

	if (mode !== MODE_BLOCKING && mode !== MODE_NON_BLOCKING) {
		throw new Error(`invalid mode "${mode}": use blocking or non-blocking`);
	}

	return { mode };
}

function evaluatePolicy(cwd) {
	runGit(["rev-parse", "--is-inside-work-tree"], { cwd });

	const remotes = listRemotes(cwd);
	const currentBranch = getCurrentBranch(cwd);
	const trackingBranch = getTrackingBranch(cwd);
	const hasOrigin = remotes.has("origin");
	const hasUpstream = remotes.has("upstream");
	const canTrackCurrentBranch =
		Boolean(currentBranch) &&
		!PROTECTED_BRANCHES.has(currentBranch) &&
		SYNC_BRANCH_PATTERN.test(currentBranch);

	const checks = [
		makeCheck(
			"remote.origin",
			hasOrigin,
			hasOrigin ? "origin remote exists." : "origin remote is missing.",
			"git remote add origin <fork-repo-url>",
		),
		makeCheck(
			"remote.upstream",
			hasUpstream,
			hasUpstream ? "upstream remote exists." : "upstream remote is missing.",
			`git remote add upstream ${DEFAULT_UPSTREAM_URL}`,
		),
		makeCheck(
			"branch.current",
			Boolean(currentBranch),
			currentBranch
				? `current branch is "${currentBranch}".`
				: "detached HEAD or cannot resolve current branch.",
			"git switch -c chore/upstream-sync-YYYYMMDD",
		),
		makeCheck(
			"branch.not_protected",
			currentBranch ? !PROTECTED_BRANCHES.has(currentBranch) : false,
			currentBranch && !PROTECTED_BRANCHES.has(currentBranch)
				? "current branch is not protected."
				: "sync must not run on protected branch main/master.",
			"git switch -c chore/upstream-sync-YYYYMMDD",
		),
		makeCheck(
			"branch.naming",
			currentBranch ? SYNC_BRANCH_PATTERN.test(currentBranch) : false,
			currentBranch && SYNC_BRANCH_PATTERN.test(currentBranch)
				? "branch naming policy is satisfied."
				: "branch must match chore/upstream-sync-YYYYMMDD.",
			"git branch -m chore/upstream-sync-YYYYMMDD",
		),
		makeCheck(
			"branch.tracking",
			currentBranch ? trackingBranch === `origin/${currentBranch}` : false,
			trackingBranch
				? `tracking branch is "${trackingBranch}".`
				: "tracking branch is not configured.",
			canTrackCurrentBranch
				? `git push -u origin ${currentBranch}`
				: "git switch -c chore/upstream-sync-YYYYMMDD && git push -u origin chore/upstream-sync-YYYYMMDD",
		),
		makeCheck(
			"remote.origin_main",
			hasOrigin && hasRemoteBranch(cwd, "origin"),
			hasOrigin
				? "origin/main is available locally."
				: "origin/main is unavailable because origin is missing.",
			"git fetch origin main",
		),
		makeCheck(
			"remote.upstream_main",
			hasUpstream && hasRemoteBranch(cwd, "upstream"),
			hasUpstream && hasRemoteBranch(cwd, "upstream")
				? "upstream/main is available locally."
				: hasUpstream
					? "upstream/main has not been fetched locally."
					: "upstream/main is unavailable because upstream is missing.",
			"git fetch upstream main",
		),
	];

	const failedChecks = checks.filter((check) => !check.passed);

	return {
		ok: failedChecks.length === 0,
		cwd,
		currentBranch: currentBranch || null,
		trackingBranch: trackingBranch || null,
		checks,
	};
}

function printReport(report, mode) {
	process.stdout.write("Upstream sync preflight check\n");
	process.stdout.write(`Working directory: ${report.cwd}\n`);
	process.stdout.write(`Mode: ${mode}\n`);
	process.stdout.write(
		"Scope: clone-local preflight only. Repo-wide upstream contract health is reported by `npm run repo:upstream:check`.\n",
	);
	process.stdout.write(
		`Current branch: ${report.currentBranch ?? "(detached)"} | Tracking: ${report.trackingBranch ?? "(none)"}\n`,
	);
	process.stdout.write("\n");

	for (const check of report.checks) {
		const tag = check.passed ? "PASS" : "FAIL";
		process.stdout.write(`[${tag}] ${check.id}: ${check.detail}\n`);
		if (!check.passed) {
			process.stdout.write(`       fix: ${check.fix}\n`);
		}
	}

	const failedCount = report.checks.filter((check) => !check.passed).length;
	process.stdout.write("\n");
	process.stdout.write(
		`Summary: ${report.checks.length - failedCount} passed, ${failedCount} failed.\n`,
	);
	if (report.ok) {
		process.stdout.write(
			"Result: this clone satisfies the current sync preflight checks.\n",
		);
		return;
	}
	process.stdout.write(
		mode === MODE_BLOCKING
			? "Result: blocked for this clone. Fix failed checks before syncing.\n"
			: "Result: non-blocking mode active. Repo-wide contracts may still be healthy, but this clone is not currently sync-ready.\n",
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
		const { mode } = parseCliArgs(process.argv.slice(2));
		const report = evaluatePolicy(process.cwd());
		printReport(report, mode);
		process.exitCode =
			report.ok || mode === MODE_NON_BLOCKING ? EXIT_OK : EXIT_POLICY_FAIL;
	} catch (error) {
		process.stderr.write(
			`sync-upstream-check runtime error: ${
				error instanceof Error ? error.message : String(error)
			}\n`,
		);
		process.exitCode = EXIT_RUNTIME_ERROR;
	}
}

if (isDirectExecution()) {
	main();
}

export {
	DEFAULT_UPSTREAM_URL,
	EXIT_OK,
	EXIT_POLICY_FAIL,
	EXIT_RUNTIME_ERROR,
	MODE_BLOCKING,
	MODE_NON_BLOCKING,
	SYNC_BRANCH_PATTERN,
	evaluatePolicy,
	parseCliArgs,
};
