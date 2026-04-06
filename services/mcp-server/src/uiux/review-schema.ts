import { z } from "zod";
import { UiuxAuditCategoryIdSchema } from "./audit-foundation.js";

export const UiuxIssueSchema = z.object({
	id: z.string().min(1),
	severity: z.enum(["low", "medium", "high"]),
	title: z.string().min(1),
	detail: z.string().min(1),
	recommendation: z.string().min(1),
	category: UiuxAuditCategoryIdSchema.default("consistency"),
	confidence: z.enum(["low", "medium", "high"]).default("medium"),
	priority: z.enum(["p1", "p2", "p3", "p4"]).default("p3"),
	principle: z.string().min(1).default("general"),
	taskFlowImpact: z.boolean().default(false),
	evidence: z.string().default(""),
});

export const UiuxReviewSchema = z
	.object({
		score: z.number().min(0).max(100),
		threshold: z.number().min(0).max(100).default(80),
		issues: z.array(UiuxIssueSchema).default([]),
	})
	.transform((value) => ({
		...value,
		passed: value.score >= value.threshold,
	}));

export type UiuxIssue = z.output<typeof UiuxIssueSchema>;
export type UiuxReview = z.output<typeof UiuxReviewSchema>;
