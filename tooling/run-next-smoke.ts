import { runNextSmoke } from "../services/mcp-server/src/public/next-smoke.ts";

type CliOptions = {
	targetRoot?: string;
	targetSource: "cli" | "env" | "default";
};

const DEFAULT_APP_TARGET_ROOT = "apps/web";

function parseArgs(argv: string[]): CliOptions {
	let targetRootFromCli: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) {
			continue;
		}
		if (!token.startsWith("--")) {
			if (!targetRootFromCli) {
				targetRootFromCli = token;
			}
			continue;
		}

		if (token === "--target-root") {
			targetRootFromCli = argv[index + 1];
			index += 1;
			continue;
		}
		if (token === "--fallback-root" || token === "--compat-fixture") {
			throw new Error(
				`${token} has been removed. apps/web is the only default smoke target.`,
			);
		}
	}

	const targetFromEnv = process.env.OPENUI_SMOKE_TARGET_ROOT;
	if (targetRootFromCli) {
		return {
			targetRoot: targetRootFromCli,
			targetSource: "cli",
		};
	}
	if (targetFromEnv) {
		return {
			targetRoot: targetFromEnv,
			targetSource: "env",
		};
	}

	return {
		targetRoot: DEFAULT_APP_TARGET_ROOT,
		targetSource: "default",
	};
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	process.stderr.write(
		`[next-smoke] target=${options.targetRoot ?? "(none)"} source=${options.targetSource}\n`,
	);

	const result = await runNextSmoke({
		targetRoot: options.targetRoot,
	});
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

	if (!result.passed) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`[next-smoke] fatal: ${message}\n`);
	process.exit(1);
});
