import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listOpenuiModels, textResult } from "./shared.js";

export function registerModelsTool(server: McpServer): void {
	server.registerTool(
		"openui_list_models",
		{
			description: "List available models from the Gemini runtime provider.",
			inputSchema: z.object({}),
		},
		async () => {
			const models = await listOpenuiModels();
			return textResult(JSON.stringify(models, null, 2));
		},
	);
}
