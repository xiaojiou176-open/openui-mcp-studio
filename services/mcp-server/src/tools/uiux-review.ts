import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGeminiModelStrong } from "../constants.js";
import { openuiChatComplete } from "../openui-client.js";
import { buildIssues } from "../uiux/review-issue-builder.js";
import { type UiuxReview, UiuxReviewSchema } from "../uiux/review-schema.js";
import { newRequestId, textResult } from "./shared.js";

const UiuxReviewInputSchema = z.object({
	html: z.string().min(1),
	threshold: z.number().min(0).max(100).default(80),
	invokeModel: z.boolean().default(true),
	invokeHeuristics: z.boolean().default(false),
	model: z.string().optional(),
	screenshotBase64: z.string().optional(),
	screenshotMimeType: z.string().default("image/png"),
	taskFlowCritical: z.boolean().default(false),
});

type IssueDraft = ReturnType<typeof buildIssues>[number];
type ReviewIssueConfidence = "low" | "medium" | "high";
type ReviewIssueImpact = "low" | "medium" | "high";
type ReviewIssueSource = "model" | "heuristic";
type ReviewIssuePriority = "p1" | "p2" | "p3" | "p4";

type ReviewIssuePayload = UiuxReview["issues"][number] & {
	confidence: ReviewIssueConfidence;
	impact: ReviewIssueImpact;
	evidenceSnippet: string;
	source: ReviewIssueSource;
};

type ReviewPayload = Omit<UiuxReview, "issues"> & {
	issues: ReviewIssuePayload[];
};

const ReviewIssuePayloadSchema = z.object({
	id: z.string().min(1),
	severity: z.enum(["low", "medium", "high"]),
	title: z.string().min(1),
	detail: z.string().min(1),
	recommendation: z.string().min(1),
	confidence: z.enum(["low", "medium", "high"]).default("medium"),
	impact: z.enum(["low", "medium", "high"]).default("medium"),
	evidenceSnippet: z.string().min(1),
	priority: z.enum(["p1", "p2", "p3", "p4"]).default("p3"),
	principle: z.string().min(1).default("general"),
	taskFlowImpact: z.boolean().default(false),
});

const ModelReviewResponseSchema = z.object({
	score: z.number().min(0).max(100),
	summary: z.string().min(1),
	issues: z.array(ReviewIssuePayloadSchema).default([]),
});

const SEVERITY_WEIGHT: Record<"low" | "medium" | "high", number> = {
	low: 1,
	medium: 1.15,
	high: 1.35,
};

const CONFIDENCE_WEIGHT: Record<"low" | "medium" | "high", number> = {
	low: 0.85,
	medium: 1,
	high: 1.15,
};

const HIGH_CONFIDENCE_ISSUE_IDS = new Set<string>([
	"missing-main-landmark",
	"missing-h1",
	"multiple-h1",
	"image-alt-missing",
	"link-href-missing",
	"button-type-missing",
	"form-label-missing",
	"text-contrast-insufficient-static",
	"non-text-contrast-insufficient-static",
]);

const TASK_FLOW_ISSUE_IDS = new Set<string>([
	"primary-action-overload",
	"dialog-focus-trap-risk",
	"dialog-esc-close-missing",
	"button-accessible-name-missing",
	"form-label-missing",
	"positive-tabindex",
	"focus-indicator-suppressed",
]);

const PRINCIPLE_BY_ISSUE_ID: Record<string, string> = {
	"primary-action-overload": "nielsen-h8",
	"dialog-focus-trap-risk": "nielsen-h5",
	"dialog-esc-close-missing": "nielsen-h3",
	"missing-h1": "h1-h10",
	"multiple-h1": "h1-h10",
};

function deriveIssueMetadata(issue: IssueDraft): {
	confidence: ReviewIssueConfidence;
	priority: ReviewIssuePriority;
	principle: string;
	taskFlowImpact: boolean;
	evidence: string;
} {
	const taskFlowImpact =
		typeof issue.taskFlowImpact === "boolean"
			? issue.taskFlowImpact
			: TASK_FLOW_ISSUE_IDS.has(issue.id);
	const confidence =
		issue.confidence ??
		(HIGH_CONFIDENCE_ISSUE_IDS.has(issue.id) ? "high" : "medium");

	const priority =
		issue.priority ??
		(taskFlowImpact || issue.severity === "high"
			? "p1"
			: issue.severity === "medium"
				? "p2"
				: "p3");

	return {
		confidence,
		priority,
		principle: issue.principle ?? PRINCIPLE_BY_ISSUE_ID[issue.id] ?? "general",
		taskFlowImpact,
		evidence: issue.evidence ?? `Heuristic signal: ${issue.detail}`,
	};
}

function deriveImpact(options: {
	severity: "low" | "medium" | "high";
	taskFlowImpact: boolean;
}): ReviewIssueImpact {
	if (options.severity === "high" || options.taskFlowImpact) {
		return "high";
	}
	if (options.severity === "medium") {
		return "medium";
	}
	return "low";
}

function clipEvidenceSnippet(value: string): string {
	return value.replace(/\s+/gu, " ").trim().slice(0, 200);
}

function calculateScore(
	issues: IssueDraft[],
	taskFlowCritical: boolean,
): number {
	const weightedPenalty = issues.reduce((sum, issue) => {
		const metadata = deriveIssueMetadata(issue);
		const severityWeight = SEVERITY_WEIGHT[issue.severity];
		const confidenceWeight = CONFIDENCE_WEIGHT[metadata.confidence];
		const taskFlowWeight =
			taskFlowCritical && metadata.taskFlowImpact ? 1.25 : 1;
		return (
			sum + issue.penalty * severityWeight * confidenceWeight * taskFlowWeight
		);
	}, 0);

	return Math.max(
		0,
		Math.min(100, Math.round((100 - weightedPenalty) * 100) / 100),
	);
}

function enrichHeuristicIssue(issue: IssueDraft): ReviewIssuePayload {
	const metadata = deriveIssueMetadata(issue);
	const evidenceSnippet = clipEvidenceSnippet(
		metadata.evidence || `Heuristic signal: ${issue.detail}`,
	);

	return {
		id: issue.id,
		severity: issue.severity,
		title: issue.title,
		detail: issue.detail,
		recommendation: issue.recommendation,
		confidence: metadata.confidence,
		impact: deriveImpact({
			severity: issue.severity,
			taskFlowImpact: metadata.taskFlowImpact,
		}),
		evidenceSnippet,
		source: "heuristic",
		priority: metadata.priority,
		principle: metadata.principle,
		taskFlowImpact: metadata.taskFlowImpact,
		evidence: metadata.evidence,
	};
}

function evaluateHeuristicUiux(
	html: string,
	threshold: number,
	taskFlowCritical: boolean,
): ReviewPayload {
	const issueDrafts = buildIssues(html);
	const score = calculateScore(issueDrafts, taskFlowCritical);
	const parsed = UiuxReviewSchema.parse({
		score,
		threshold,
		issues: issueDrafts.map((issue) => {
			const metadata = deriveIssueMetadata(issue);
			return {
				id: issue.id,
				severity: issue.severity,
				title: issue.title,
				detail: issue.detail,
				recommendation: issue.recommendation,
				...metadata,
			};
		}),
	});

	return {
		...parsed,
		issues: issueDrafts.map((issue) => enrichHeuristicIssue(issue)),
	};
}

function stripFencedJson(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed.startsWith("```")) {
		return trimmed;
	}
	return trimmed
		.replace(/^```(?:json)?\s*/iu, "")
		.replace(/\s*```$/u, "")
		.trim();
}

async function requestModelReview(input: {
	html: string;
	threshold: number;
	model?: string;
	screenshotBase64?: string;
	screenshotMimeType: string;
	taskFlowCritical: boolean;
}): Promise<{ review: ReviewPayload; summary: string }> {
	const inputParts = input.screenshotBase64
		? [
				{
					type: "image" as const,
					mimeType: input.screenshotMimeType,
					data: input.screenshotBase64,
					mediaResolution: "high" as const,
				},
			]
		: undefined;

	const prompt = [
		"Review the UI/UX quality of the provided HTML and return strict JSON only.",
		"",
		"Scoring rules:",
		"- score must be 0..100 where higher is better.",
		`- threshold is ${String(input.threshold)} and taskFlowCritical=${input.taskFlowCritical ? "true" : "false"}.`,
		"- issues must be concrete, actionable, and anchored to visible markup evidence.",
		"- keep issue count concise (max 8).",
		"- confidence reflects how certain you are from the provided HTML and optional screenshot.",
		"- impact reflects likely user-facing severity, not engineering effort.",
		"- evidenceSnippet must quote or summarize the exact HTML fragment that triggered the finding.",
		"- use principle values like wcag-2.2-aa, design-tokens, hierarchy, clarity, keyboard, responsive, or general.",
		"- set taskFlowImpact=true when the issue can block or seriously degrade a primary user action.",
		"",
		"HTML:",
		input.html,
	].join("\n");

	const raw = await openuiChatComplete({
		requestId: newRequestId("uiux_review"),
		routeKey: "strong",
		model: input.model?.trim() || getGeminiModelStrong().model,
		prompt,
		system:
			"You are a principal UI/UX reviewer. Return JSON only. Focus on hierarchy, accessibility, clarity, task success, and design-system consistency.",
		inputParts,
		responseMimeType: "application/json",
		responseJsonSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				score: { type: "number", minimum: 0, maximum: 100 },
				summary: { type: "string", minLength: 1 },
				issues: {
					type: "array",
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							id: { type: "string", minLength: 1 },
							severity: {
								type: "string",
								enum: ["low", "medium", "high"],
							},
							title: { type: "string", minLength: 1 },
							detail: { type: "string", minLength: 1 },
							recommendation: { type: "string", minLength: 1 },
							confidence: {
								type: "string",
								enum: ["low", "medium", "high"],
							},
							impact: {
								type: "string",
								enum: ["low", "medium", "high"],
							},
							evidenceSnippet: { type: "string", minLength: 1 },
							priority: {
								type: "string",
								enum: ["p1", "p2", "p3", "p4"],
							},
							principle: { type: "string", minLength: 1 },
							taskFlowImpact: { type: "boolean" },
						},
						required: [
							"id",
							"severity",
							"title",
							"detail",
							"recommendation",
							"confidence",
							"impact",
							"evidenceSnippet",
							"priority",
							"principle",
							"taskFlowImpact",
						],
					},
				},
			},
			required: ["score", "summary", "issues"],
		},
		policyConfig: {
			structuredOutputRequired: true,
			autoIncludeThoughts: false,
			autoContextCaching: true,
			autoMediaResolution: true,
		},
	});

	let parsed: z.infer<typeof ModelReviewResponseSchema>;
	try {
		parsed = ModelReviewResponseSchema.parse(JSON.parse(stripFencedJson(raw)));
	} catch {
		parsed = {
			score: 100,
			summary:
				raw.trim() || "Model review completed without structured findings.",
			issues: [],
		};
	}
	const review = UiuxReviewSchema.parse({
		score: parsed.score,
		threshold: input.threshold,
		issues: parsed.issues.map((issue) => ({
			id: issue.id,
			severity: issue.severity,
			title: issue.title,
			detail: issue.detail,
			recommendation: issue.recommendation,
			confidence: issue.confidence,
			priority: issue.priority,
			principle: issue.principle,
			taskFlowImpact: issue.taskFlowImpact,
			evidence: issue.evidenceSnippet,
		})),
	});

	return {
		review: {
			...review,
			issues: parsed.issues.map((issue) => ({
				id: issue.id,
				severity: issue.severity,
				title: issue.title,
				detail: issue.detail,
				recommendation: issue.recommendation,
				confidence: issue.confidence,
				impact: issue.impact,
				evidenceSnippet: clipEvidenceSnippet(issue.evidenceSnippet),
				source: "model",
				priority: issue.priority,
				principle: issue.principle,
				taskFlowImpact: issue.taskFlowImpact,
				evidence: issue.evidenceSnippet,
			})),
		},
		summary: parsed.summary,
	};
}

function mergeReviewPayloads(input: {
	threshold: number;
	modelReview?: ReviewPayload;
	heuristicReview?: ReviewPayload;
}): ReviewPayload {
	const mergedIssues = new Map<string, ReviewIssuePayload>();

	for (const issue of input.modelReview?.issues ?? []) {
		mergedIssues.set(`${issue.source}:${issue.id}:${issue.title}`, issue);
	}

	for (const issue of input.heuristicReview?.issues ?? []) {
		const heuristicKey = `${issue.source}:${issue.id}:${issue.title}`;
		const modelDuplicate = Array.from(mergedIssues.values()).find(
			(existing) =>
				existing.id === issue.id &&
				existing.title === issue.title &&
				existing.source === "model",
		);
		if (!modelDuplicate) {
			mergedIssues.set(heuristicKey, issue);
		}
	}

	const modelScore = input.modelReview?.score ?? 100;
	const heuristicScore = input.heuristicReview?.score ?? 100;
	const score = Math.min(modelScore, heuristicScore);

	return {
		score,
		threshold: input.threshold,
		passed: score >= input.threshold,
		issues: Array.from(mergedIssues.values()),
	};
}

export function registerUiuxReviewTool(server: McpServer): void {
	server.registerTool(
		"openui_review_uiux",
		{
			description:
				"Run model-first UI/UX review from HTML, with heuristics available as explicit opt-in.",
			inputSchema: UiuxReviewInputSchema,
		},
		async (args) => {
			const input = UiuxReviewInputSchema.parse(args);
			const invokeHeuristics = input.invokeHeuristics || !input.invokeModel;

			const modelReview = input.invokeModel
				? await requestModelReview({
						html: input.html,
						threshold: input.threshold,
						model: input.model,
						screenshotBase64: input.screenshotBase64,
						screenshotMimeType: input.screenshotMimeType,
						taskFlowCritical: input.taskFlowCritical,
					})
				: undefined;

			const heuristicReview = invokeHeuristics
				? evaluateHeuristicUiux(
						input.html,
						input.threshold,
						input.taskFlowCritical,
					)
				: undefined;

			const review = mergeReviewPayloads({
				threshold: input.threshold,
				modelReview: modelReview?.review,
				heuristicReview,
			});

			return textResult(
				JSON.stringify(
					{
						status: "ok",
						review,
						modelCritique: modelReview?.summary,
					},
					null,
					2,
				),
			);
		},
	);
}
