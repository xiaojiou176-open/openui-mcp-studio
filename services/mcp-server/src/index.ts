import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	buildDefaultShadcnStyleGuide,
	getOpenuiMcpLogLevel,
	getOpenuiModelRoutingMode,
	getWorkspaceRoot,
	MCP_SERVER_VERSION,
	validateOpenuiRuntimeConfig,
} from "./constants.js";
import { logInfo } from "./logger.js";
import { detectShadcnPaths } from "./path-detection.js";
import { registerApplyTool } from "./tools/apply.js";
import { registerComputerUseTool } from "./tools/computer-use.js";
import { registerConvertTools } from "./tools/convert.js";
import { registerDetectTool } from "./tools/detect.js";
import { registerEmbedTool } from "./tools/embed.js";
import { registerGenerateTool } from "./tools/generate.js";
import { registerModelsTool } from "./tools/models.js";
import { registerPlanTool } from "./tools/plan.js";
import { registerQualityTool } from "./tools/quality.js";
import { registerRagTool } from "./tools/rag.js";
import { registerRefineTool } from "./tools/refine.js";
import { registerRepoWorkflowSummaryTool } from "./tools/repo-workflow-summary.js";
import { registerReviewBundleTool } from "./tools/review-bundle.js";
import { registerShipTool } from "./tools/ship.js";
import { registerShipFeatureFlowTool } from "./tools/ship-feature-flow.js";
import { registerSmokeTool } from "./tools/smoke.js";
import { registerAcceptanceTool } from "./tools/acceptance.js";
import { registerUiuxReviewTool } from "./tools/uiux-review.js";
import { registerWorkspaceScanTool } from "./tools/workspace-scan.js";

export function createServer(): McpServer {
	validateOpenuiRuntimeConfig();

	const server = new McpServer({
		name: "openui-mcp-studio",
		version: MCP_SERVER_VERSION,
	});

	registerDetectTool(server);
	registerModelsTool(server);
	registerGenerateTool(server);
	registerRefineTool(server);
	registerConvertTools(server);
	registerWorkspaceScanTool(server);
	registerPlanTool(server);
	registerApplyTool(server);
	registerEmbedTool(server);
	registerRagTool(server);
	registerComputerUseTool(server);
	registerUiuxReviewTool(server);
	registerQualityTool(server);
	registerAcceptanceTool(server);
	registerReviewBundleTool(server);
	registerRepoWorkflowSummaryTool(server);
	registerSmokeTool(server);
	registerShipTool(server);
	registerShipFeatureFlowTool(server);

	server.registerResource(
		"openui_styleguide_default",
		"openui://styleguide/default",
		{
			title: "Default React + Tailwind + shadcn Style Guide",
			description:
				"Built-in style guide used by generate/convert tools when styleGuide is not provided.",
			mimeType: "text/plain",
		},
		async () => {
			const detection = await detectShadcnPaths();
			return {
				contents: [
					{
						uri: "openui://styleguide/default",
						mimeType: "text/plain",
						text: buildDefaultShadcnStyleGuide(detection.uiImportBase),
					},
				],
			};
		},
	);

	return server;
}

export async function runStdioServer(): Promise<void> {
	const server = createServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);

	logInfo("mcp_server_started", {
		traceId: "mcp_server_runtime",
		stage: "startup",
		provider: "gemini",
		context: {
			workspaceRoot: getWorkspaceRoot(),
			modelRoutingMode: getOpenuiModelRoutingMode(),
			logLevel: getOpenuiMcpLogLevel(),
		},
	});
}
