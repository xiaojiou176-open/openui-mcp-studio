import path from "node:path";
import process from "node:process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerShipTool } from "../services/mcp-server/src/public/ship.js";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

type DemoOptions = {
	prompt: string;
	workspaceRoot: string;
	pagePath: string;
	componentsDir: string;
	model?: string;
	timeoutMs: number;
	apply: boolean;
	runCommands: boolean;
};

const DEFAULT_PROMPT = [
	"Create a polished pricing page hero for OpenUI MCP Studio.",
	"Include a short headline, a one-line value proposition, three pricing tiers,",
	"one highlighted recommended plan, and a compact trust row for smoke, visual, and release checks.",
].join(" ");

function printHelp(): void {
	process.stdout.write(`Usage: npm run demo:ship -- [options]

Runs the real openui_ship_react_page tool against a workspace and prints the JSON result.

Options:
  --prompt <text>          Custom prompt. Defaults to a built-in pricing-page demo prompt.
  --workspace-root <path>  Target workspace root. Defaults to apps/web.
  --page-path <path>       Target page path. Defaults to app/page.tsx.
  --components-dir <path>  Target components directory. Defaults to components/generated.
  --model <name>           Model override. Defaults to GEMINI_MODEL_FAST when available.
  --timeout-ms <ms>        Request timeout for the demo run. Defaults to 120000.
  --apply                  Write generated files into the target workspace.
  --run-commands           Allow quality-gate commands during the demo run.
  --help                   Show this help.
`);
}

function resolveDemoTimeoutMs(rawValue: string | undefined): number {
	const parsed = Number(rawValue);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return 120_000;
	}
	return parsed;
}

function parseArgs(argv: string[]): DemoOptions {
	let prompt = DEFAULT_PROMPT;
	let workspaceRoot = "apps/web";
	let pagePath = "app/page.tsx";
	let componentsDir = "components/generated";
	let model = process.env.GEMINI_MODEL_FAST?.trim() || undefined;
	let timeoutMs = 120_000;
	let apply = false;
	let runCommands = false;

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) {
			continue;
		}
		if (token === "--help") {
			printHelp();
			process.exit(0);
		}
		if (token === "--prompt") {
			prompt = argv[index + 1] ?? prompt;
			index += 1;
			continue;
		}
		if (token === "--workspace-root") {
			workspaceRoot = argv[index + 1] ?? workspaceRoot;
			index += 1;
			continue;
		}
		if (token === "--page-path") {
			pagePath = argv[index + 1] ?? pagePath;
			index += 1;
			continue;
		}
		if (token === "--components-dir") {
			componentsDir = argv[index + 1] ?? componentsDir;
			index += 1;
			continue;
		}
		if (token === "--model") {
			model = argv[index + 1] ?? model;
			index += 1;
			continue;
		}
		if (token === "--timeout-ms") {
			timeoutMs = resolveDemoTimeoutMs(argv[index + 1]);
			index += 1;
			continue;
		}
		if (token === "--apply") {
			apply = true;
			continue;
		}
		if (token === "--run-commands") {
			runCommands = true;
			continue;
		}
		throw new Error(`Unknown flag: ${token}`);
	}

	return {
		prompt,
		workspaceRoot: path.resolve(process.cwd(), workspaceRoot),
		pagePath,
		componentsDir,
		model,
		timeoutMs,
		apply,
		runCommands,
	};
}

function createToolHarness(): {
	server: McpServer;
	getHandler: (name: string) => ToolHandler;
} {
	const handlers = new Map<string, ToolHandler>();

	const server = {
		registerTool(name: string, _config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid tool handler for ${name}`);
			}
			handlers.set(name, handler as ToolHandler);
		},
	} as unknown as McpServer;

	return {
		server,
		getHandler(name: string) {
			const handler = handlers.get(name);
			if (!handler) {
				throw new Error(`Missing tool handler: ${name}`);
			}
			return handler;
		},
	};
}

function readText(result: TextResult): string {
	const block = result.content.find((item) => item.type === "text");
	if (!block?.text) {
		throw new Error("Tool result is missing text content.");
	}
	return block.text;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	process.env.OPENUI_TIMEOUT_MS = String(options.timeoutMs);
	const harness = createToolHarness();
	registerShipTool(harness.server);

	process.stderr.write(
		`[demo-ship] workspace=${options.workspaceRoot} model=${options.model ?? "(default)"} timeoutMs=${options.timeoutMs} apply=${String(options.apply)} runCommands=${String(options.runCommands)}\n`,
	);
	process.stderr.write(`[demo-ship] prompt=${options.prompt}\n`);

	const result = await harness.getHandler("openui_ship_react_page")({
		prompt: options.prompt,
		workspaceRoot: options.workspaceRoot,
		pagePath: options.pagePath,
		componentsDir: options.componentsDir,
		model: options.model,
		includeThoughts: false,
		dryRun: !options.apply,
		runCommands: options.runCommands,
	});

	process.stdout.write(`${readText(result)}\n`);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`[demo-ship] fatal: ${message}\n`);
	process.exit(1);
});
