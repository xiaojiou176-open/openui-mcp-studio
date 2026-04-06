import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildRepoWorkflowSummary } from "../../services/mcp-server/src/public/workflow-summary.js";

function parseArgs(argv: string[]) {
	let workspaceRoot: string | undefined;
	let failedRunsLimit = 10;

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--workspace-root") {
			workspaceRoot = argv[index + 1];
			index += 1;
			continue;
		}
		if (token === "--failed-runs-limit") {
			const parsed = Number(argv[index + 1]);
			if (Number.isInteger(parsed) && parsed > 0) {
				failedRunsLimit = parsed;
			}
			index += 1;
		}
	}

	return {
		workspaceRoot: workspaceRoot || process.cwd(),
		failedRunsLimit,
	};
}

async function runRepoWorkflowSummaryCli(argv = process.argv.slice(2)) {
	const args = parseArgs(argv);
	const summary = await buildRepoWorkflowSummary(args);
	process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	runRepoWorkflowSummaryCli().catch((error) => {
		process.stderr.write(
			`[repo-workflow-summary] ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exit(1);
	});
}

export { parseArgs, runRepoWorkflowSummaryCli };
