import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerAcceptanceTool } from "../../../services/mcp-server/src/tools/acceptance.js";
import { registerApplyTool } from "../../../services/mcp-server/src/tools/apply.js";
import { registerConvertTools } from "../../../services/mcp-server/src/tools/convert.js";
import { registerDetectTool } from "../../../services/mcp-server/src/tools/detect.js";
import { registerEmbedTool } from "../../../services/mcp-server/src/tools/embed.js";
import { registerGenerateTool } from "../../../services/mcp-server/src/tools/generate.js";
import { registerModelsTool } from "../../../services/mcp-server/src/tools/models.js";
import { registerPlanTool } from "../../../services/mcp-server/src/tools/plan.js";
import { registerQualityTool } from "../../../services/mcp-server/src/tools/quality.js";
import { registerRefineTool } from "../../../services/mcp-server/src/tools/refine.js";
import { registerRepoWorkflowSummaryTool } from "../../../services/mcp-server/src/tools/repo-workflow-summary.js";
import { registerReviewBundleTool } from "../../../services/mcp-server/src/tools/review-bundle.js";
import { registerShipFeatureFlowTool } from "../../../services/mcp-server/src/tools/ship-feature-flow.js";
import { registerShipTool } from "../../../services/mcp-server/src/tools/ship.js";
import { registerSmokeTool } from "../../../services/mcp-server/src/tools/smoke.js";
import { registerUiuxReviewTool } from "../../../services/mcp-server/src/tools/uiux-review.js";
import { registerWorkspaceScanTool } from "../../../services/mcp-server/src/tools/workspace-scan.js";
import type { HostedApiToolDescriptor, HostedApiToolResult } from "./types.js";

type RegisteredToolHandler = (
	args: Record<string, unknown>,
) => Promise<HostedApiToolResult>;

type RegisteredToolConfig = {
	description?: string;
	inputSchema?: z.ZodType<unknown>;
};

type RegisteredToolEntry = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	zodInputSchema?: z.ZodType<unknown>;
	handler: RegisteredToolHandler;
};

export const DEFAULT_HOSTED_API_TOOL_ALLOWLIST = [
	"openui_detect_shadcn_paths",
	"openui_list_models",
	"openui_generate_ui",
	"openui_refine_ui",
	"openui_convert_react_shadcn",
	"openui_make_react_page",
	"openui_scan_workspace_profile",
	"openui_plan_change",
	"openui_apply_files",
	"openui_embed_content",
	"openui_review_uiux",
	"openui_quality_gate",
	"openui_build_acceptance_pack",
	"openui_build_review_bundle",
	"openui_repo_workflow_summary",
	"openui_next_smoke",
	"openui_ship_react_page",
	"openui_ship_feature_flow",
] as const;

const TOOL_REGISTERERS = [
	registerDetectTool,
	registerModelsTool,
	registerGenerateTool,
	registerRefineTool,
	registerConvertTools,
	registerWorkspaceScanTool,
	registerPlanTool,
	registerApplyTool,
	registerEmbedTool,
	registerUiuxReviewTool,
	registerQualityTool,
	registerAcceptanceTool,
	registerReviewBundleTool,
	registerRepoWorkflowSummaryTool,
	registerSmokeTool,
	registerShipTool,
	registerShipFeatureFlowTool,
] as const;

function toJsonSchema(
	value: z.ZodType<unknown> | undefined,
): Record<string, unknown> {
	if (!value) {
		return { type: "object", additionalProperties: true };
	}

	try {
		return z.toJSONSchema(value) as Record<string, unknown>;
	} catch {
		return { type: "object", additionalProperties: true };
	}
}

function createRegistryHarness() {
	const entries = new Map<string, RegisteredToolEntry>();
	const server = {
		registerTool(name: string, config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid handler for tool ${name}`);
			}

			const typedConfig =
				config && typeof config === "object"
					? (config as RegisteredToolConfig)
					: {};
			entries.set(name, {
				name,
				description:
					typeof typedConfig.description === "string"
						? typedConfig.description
						: "",
				inputSchema: toJsonSchema(typedConfig.inputSchema),
				zodInputSchema: typedConfig.inputSchema,
				handler: handler as RegisteredToolHandler,
			});
		},
	} as unknown as McpServer;

	return { server, entries };
}

export type HostedApiToolRegistry = {
	toolNames: string[];
	listTools: () => HostedApiToolDescriptor[];
	getTool: (name: string) => RegisteredToolEntry | undefined;
	callTool: (
		name: string,
		args: Record<string, unknown> | undefined,
	) => Promise<HostedApiToolResult>;
};

export function buildHostedApiToolRegistry(options?: {
	allowedTools?: readonly string[];
}): HostedApiToolRegistry {
	const allowedTools = new Set(
		options?.allowedTools?.length
			? options.allowedTools
			: DEFAULT_HOSTED_API_TOOL_ALLOWLIST,
	);
	const harness = createRegistryHarness();

	for (const registerTool of TOOL_REGISTERERS) {
		registerTool(harness.server);
	}

	const filteredEntries = new Map(
		[...harness.entries.entries()].filter(([name]) => allowedTools.has(name)),
	);

	return {
		toolNames: [...filteredEntries.keys()].sort(),
		listTools() {
			return [...filteredEntries.values()]
				.map((entry) => ({
					name: entry.name,
					description: entry.description,
					inputSchema: entry.inputSchema,
				}))
				.sort((left, right) => left.name.localeCompare(right.name));
		},
		getTool(name) {
			return filteredEntries.get(name);
		},
		async callTool(name, args) {
			const entry = filteredEntries.get(name);
			if (!entry) {
				throw new Error(`Unknown hosted API tool: ${name}`);
			}

			const parsedArgs = entry.zodInputSchema
				? entry.zodInputSchema.parse(args ?? {})
				: (args ?? {});
			return entry.handler(parsedArgs as Record<string, unknown>);
		},
	};
}
