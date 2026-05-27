import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_APP_WEB_ROOT } from "../constants.js";
import type { RunNextSmokeInput } from "../next-smoke/types.js";
import { textResult } from "./shared.js";

type NextSmokeRunner = (args: Record<string, unknown>) => Promise<unknown>;

let cachedNextSmokeRunner: Promise<NextSmokeRunner> | null = null;

const nextSmokeInputSchema = z
	.object({
		targetRoot: z.string().min(1).optional(),
		buildTimeoutMs: z.number().finite().optional(),
		startupGraceMs: z.number().finite().optional(),
		probeTimeoutMs: z.number().finite().optional(),
		probeIntervalMs: z.number().finite().optional(),
		probePath: z.string().min(1).optional(),
	})
	.strict();

async function loadNextSmokeRunner(): Promise<NextSmokeRunner> {
	if (!cachedNextSmokeRunner) {
		const nextSmokeModulePath = "../next-smoke.js";
		cachedNextSmokeRunner = import(nextSmokeModulePath)
			.then((mod) => {
				const runNextSmoke = (mod as { runNextSmoke?: unknown }).runNextSmoke;
				if (typeof runNextSmoke !== "function") {
					throw new Error("next-smoke module does not export runNextSmoke.");
				}
				return runNextSmoke as NextSmokeRunner;
			})
			.catch((error) => {
				cachedNextSmokeRunner = null;
				throw error;
			});
	}

	return cachedNextSmokeRunner;
}

export function registerSmokeTool(server: McpServer): void {
	server.registerTool(
		"openui_next_smoke",
		{
			description:
				"Run Next.js smoke checks via the services/mcp-server next-smoke module when available.",
			inputSchema: nextSmokeInputSchema,
		},
		async (args) => {
			try {
				const runNextSmoke = await loadNextSmokeRunner();
				const validatedInput = nextSmokeInputSchema.parse(
					args,
				) as RunNextSmokeInput;
				const normalizedInput: RunNextSmokeInput = {
					...validatedInput,
					targetRoot: validatedInput.targetRoot || DEFAULT_APP_WEB_ROOT,
				};
				const result = await runNextSmoke(
					normalizedInput as Record<string, unknown>,
				);
				return textResult(
					typeof result === "string" ? result : JSON.stringify(result, null, 2),
				);
			} catch (error) {
				throw new Error(
					`openui_next_smoke unavailable: ${
						error instanceof Error ? error.message : String(error)
					}`,
					{ cause: error },
				);
			}
		},
	);
}
