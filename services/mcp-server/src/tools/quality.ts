import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWorkspaceRoot } from "../constants.js";
import { runQualityGate } from "../quality-gate.js";
import { GeneratedFileSchema, textResult } from "./shared.js";

export function registerQualityTool(server: McpServer): void {
	server.registerTool(
		"openui_quality_gate",
		{
			description:
				"Run UI quality checks and optional preset-based workspace checks (lint/typecheck/test/ci_gate).",
			inputSchema: z.object({
				files: z.array(GeneratedFileSchema).optional(),
				filePaths: z.array(z.string()).optional(),
				targetRoot: z.string().optional(),
				runCommands: z.boolean().default(false),
				preset: z.enum(["lint", "typecheck", "test", "ci_gate"]).optional(),
				mode: z.enum(["strict", "advisory"]).default("strict"),
				lintCommand: z
					.string()
					.optional()
					.describe("[deprecated] Ignored. Use preset."),
				typecheckCommand: z
					.string()
					.optional()
					.describe("[deprecated] Ignored. Use preset."),
				testCommand: z
					.string()
					.optional()
					.describe("[deprecated] Ignored. Use preset."),
				commandTimeoutMs: z.number().int().positive().optional(),
				uiuxScore: z.number().min(0).max(100).optional(),
				uiuxThreshold: z.number().min(0).max(100).optional(),
				acceptanceCriteria: z.array(z.string().min(1)).optional(),
				responsiveRequirements: z.array(z.string().min(1)).optional(),
				a11yRequirements: z.array(z.string().min(1)).optional(),
				visualRequirements: z.array(z.string().min(1)).optional(),
				manualReviewItems: z.array(z.string().min(1)).optional(),
				smokePassed: z.boolean().optional(),
				prompt: z.string().min(1).optional(),
			}),
		},
		async ({
			files,
			filePaths,
			targetRoot,
			runCommands,
			preset,
			mode,
			lintCommand,
			typecheckCommand,
			testCommand,
			commandTimeoutMs,
			uiuxScore,
			uiuxThreshold,
			acceptanceCriteria,
			responsiveRequirements,
			a11yRequirements,
			visualRequirements,
			manualReviewItems,
			smokePassed,
			prompt,
		}) => {
			const root = targetRoot || getWorkspaceRoot();
			const result = await runQualityGate({
				files,
				filePaths,
				targetRoot: root,
				runCommands,
				preset,
				mode,
				lintCommand,
				typecheckCommand,
				testCommand,
				commandTimeoutMs,
				uiuxScore,
				uiuxThreshold,
				acceptanceCriteria,
				responsiveRequirements,
				a11yRequirements,
				visualRequirements,
				manualReviewItems,
				smokePassed,
				prompt,
			});

			return textResult(JSON.stringify(result, null, 2));
		},
	);
}
