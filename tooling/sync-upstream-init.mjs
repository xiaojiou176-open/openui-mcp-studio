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
	if (status !== 0 && !options.allowFailure) {
		throw new Error(`git ${args.join(" ")} failed: ${(result.stderr ?? "").trim() || `exit ${status}`}`);
	}
	return {
		status,
		stdout: (result.stdout ?? "").trim(),
		stderr: (result.stderr ?? "").trim(),
	};
}

function ensureUpstreamRemote(cwd) {
	const remotes = runGit(["remote"], { cwd, allowFailure: true }).stdout
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
	if (!remotes.includes("upstream")) {
		runGit(["remote", "add", "upstream", DEFAULT_UPSTREAM_URL], { cwd });
		return { created: true, url: DEFAULT_UPSTREAM_URL };
	}
	const currentUrl = runGit(["remote", "get-url", "upstream"], { cwd }).stdout;
	if (currentUrl !== DEFAULT_UPSTREAM_URL) {
		runGit(["remote", "set-url", "upstream", DEFAULT_UPSTREAM_URL], { cwd });
		runGit(["fetch", "upstream", "main"], { cwd, allowFailure: true });
		return { created: false, url: DEFAULT_UPSTREAM_URL, updated: true };
	}
	runGit(["fetch", "upstream", "main"], { cwd, allowFailure: true });
	return { created: false, url: currentUrl, updated: false };
}

function main() {
	try {
		runGit(["rev-parse", "--is-inside-work-tree"]);
		const result = ensureUpstreamRemote(process.cwd());
		process.stdout.write(
			`[sync-upstream-init] OK upstream=${result.url} created=${result.created ? "yes" : "no"} updated=${result.updated ? "yes" : "no"} scope=clone-local-on-demand\n`,
		);
		process.exitCode = 0;
	} catch (error) {
		process.stderr.write(
			`sync-upstream-init runtime error: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 2;
	}
}

const isDirectExecution = () =>
	Boolean(process.argv[1]) &&
	pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution()) {
	main();
}

export { ensureUpstreamRemote };
