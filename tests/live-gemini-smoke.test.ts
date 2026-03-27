import { describe, expect, it } from "vitest";
import { aiChatComplete, aiListModels } from "../services/mcp-server/src/ai-client.js";
import { getGeminiModelEmbedding } from "../services/mcp-server/src/constants.js";
import { embedContentsWithGemini } from "../services/mcp-server/src/tools/embed.js";

const shouldRun = process.env.OPENUI_ENABLE_LIVE_GEMINI_SMOKE === "1";
const liveRunId = process.env.OPENUI_LIVE_TEST_RUN_ID?.trim() || "local";
const jsonMimeType = "application/json";
const journeyEvidencePrefix = "[live-journey-evidence]";

const TRANSIENT_JOURNEY_ERROR_PATTERN =
	/timeout|timed out|econnreset|enotfound|eai_again|network|socket|rate limit|429|500|502|503|504|service unavailable|temporar(?:y|ily)|unavailable/i;
const AUTH_JOURNEY_ERROR_PATTERN =
	/unauthorized|forbidden|invalid api key|api key is invalid|permission denied|insufficient permissions?|401|403/i;
const ASSERTION_JOURNEY_ERROR_PATTERN =
	/assert(?:ion)?error|expected .* to|snapshot/i;

type LiveJourneyStatus = "passed" | "failed";

interface LiveJourneyEvidence {
	journey: string;
	traceId: string;
	status: LiveJourneyStatus;
	durationMs: number;
	errorCode: string;
	errorMessage?: string;
}

function classifyJourneyErrorCode(message: string): string {
	if (AUTH_JOURNEY_ERROR_PATTERN.test(message)) {
		return "LIVE_AUTH_PERMISSION";
	}
	if (TRANSIENT_JOURNEY_ERROR_PATTERN.test(message)) {
		return "LIVE_NETWORK_TRANSIENT";
	}
	if (ASSERTION_JOURNEY_ERROR_PATTERN.test(message)) {
		return "LIVE_ASSERTION_RUNTIME";
	}
	return "LIVE_UNKNOWN";
}

function emitJourneyEvidence(evidence: LiveJourneyEvidence): void {
	console.error(`${journeyEvidencePrefix} ${JSON.stringify(evidence)}`);
}

async function runJourneyWithEvidence<T>(
	journey: string,
	work: (traceId: string) => Promise<T>,
): Promise<T> {
	const traceId = `journey_${journey}_${liveRunId}_${Date.now().toString(36)}`;
	const startedAt = Date.now();
	try {
		const result = await work(traceId);
		emitJourneyEvidence({
			journey,
			traceId,
			status: "passed",
			durationMs: Date.now() - startedAt,
			errorCode: "OK",
		});
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		emitJourneyEvidence({
			journey,
			traceId,
			status: "failed",
			durationMs: Date.now() - startedAt,
			errorCode: classifyJourneyErrorCode(message),
			errorMessage: message.slice(0, 240),
		});
		throw error;
	}
}

function extractBalancedJsonObjects(text: string): string[] {
	const objects: string[] = [];
	let start = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (start === -1) {
			if (char === "{") {
				start = index;
				depth = 1;
			}
			continue;
		}

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") {
			depth += 1;
			continue;
		}
		if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				objects.push(text.slice(start, index + 1));
				start = -1;
			}
		}
	}

	return objects;
}

function parseJsonObject(
	text: string,
	requiredKeys: string[] = [],
): Record<string, unknown> {
	const trimmed = text.trim();
	const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidates = codeFenceMatch ? [codeFenceMatch[1], trimmed] : [trimmed];
	const parsedObjects: Record<string, unknown>[] = [];

	for (const candidate of candidates) {
		for (const jsonSnippet of extractBalancedJsonObjects(candidate)) {
			try {
				const parsed = JSON.parse(jsonSnippet) as Record<string, unknown>;
				parsedObjects.push(parsed);
			} catch {
				// Continue to next snippet and preserve best-effort extraction.
			}
		}

		// Fallback path for mixed outputs where the model emits reasoning text
		// and appends a valid JSON object at the end.
		const nonEmptyLines = candidate
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		for (let index = nonEmptyLines.length - 1; index >= 0; index -= 1) {
			const line = nonEmptyLines[index];
			const open = line.indexOf("{");
			const close = line.lastIndexOf("}");
			if (open === -1 || close <= open) {
				continue;
			}
			const snippet = line.slice(open, close + 1);
			try {
				const parsed = JSON.parse(snippet) as Record<string, unknown>;
				parsedObjects.push(parsed);
				break;
			} catch {
				// Keep scanning older lines.
			}
		}
	}

	if (requiredKeys.length > 0) {
		const matched = parsedObjects.find((object) =>
			requiredKeys.every((key) => Object.hasOwn(object, key)),
		);
		if (matched) {
			return matched;
		}
	}

	if (parsedObjects.length > 0) {
		return parsedObjects[0];
	}

	throw new Error(`No valid JSON object found in response: ${trimmed}`);
}

function cosineSimilarity(left: number[], right: number[]): number {
	const dimension = Math.min(left.length, right.length);
	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;
	for (let index = 0; index < dimension; index += 1) {
		const leftValue = left[index] ?? 0;
		const rightValue = right[index] ?? 0;
		dot += leftValue * rightValue;
		leftNorm += leftValue * leftValue;
		rightNorm += rightValue * rightValue;
	}
	if (leftNorm === 0 || rightNorm === 0) {
		return 0;
	}
	return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

describe("live json parser helper", () => {
	it("parses trailing JSON when reasoning text is present", () => {
		const text = [
			"I will evaluate the copy now.",
			'Draft: {`qualityGate`:"pass"}',
			'{"qualityGate":"pass","reason":"Clear and direct copy."}',
		].join("\n");

		const parsed = parseJsonObject(text, ["qualityGate", "reason"]);
		expect(parsed.qualityGate).toBe("pass");
		expect(parsed.reason).toBe("Clear and direct copy.");
	});
});

describe("live gemini smoke", () => {
	const run = shouldRun ? it : it.skip;

	run(
		"completes a real Gemini request",
		async () => {
			const text = await aiChatComplete({
				prompt: "Reply with exactly: LIVE_SMOKE_OK",
				routeKey: "strong",
				useFast: false,
				requestId: `live_smoke_test_${liveRunId}`,
			});

			const normalized = text.trim();
			const lastNonEmptyLine = normalized
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
				.at(-1);

			expect(normalized).toContain("LIVE_SMOKE_OK");
			expect(lastNonEmptyLine).toBe("LIVE_SMOKE_OK");
		},
		90_000,
	);

	run(
		"lists real Gemini models",
		async () => {
			const models = await aiListModels(20);

			expect(models.primary.provider).toBe("gemini");
			expect(Array.isArray(models.primary.models)).toBe(true);
			expect(models.primary.models.length).toBeGreaterThan(0);
		},
		90_000,
	);

	run(
		"creates a real Gemini embedding",
		async () => {
			const embeddings = await embedContentsWithGemini({
				contents: `LIVE_EMBEDDING_SMOKE_${liveRunId}`,
				model: getGeminiModelEmbedding(),
				outputDimensionality: 128,
			});

			expect(embeddings.length).toBe(1);
			expect(embeddings[0]?.length).toBe(128);
			expect(embeddings[0]?.every((value) => Number.isFinite(value))).toBe(
				true,
			);
		},
		90_000,
	);

	run(
		"executes live handoff journey from structured plan to token confirmation",
		async () => {
			await runJourneyWithEvidence("handoff", async (traceId) => {
				const handoffToken = `LIVE_FLOW_${liveRunId}_${Date.now().toString(36).toUpperCase()}`;
				const planText = await aiChatComplete({
					prompt:
						`Return JSON only with keys screen, cta, handoffToken. ` +
						`Set handoffToken exactly to "${handoffToken}". ` +
						`Context: generate a concise UI plan for a SaaS analytics dashboard.`,
					routeKey: "strong",
					useFast: false,
					responseMimeType: jsonMimeType,
					responseJsonSchema: {
						type: "object",
						additionalProperties: false,
						properties: {
							screen: { type: "string", minLength: 3 },
							cta: { type: "string", minLength: 2 },
							handoffToken: { type: "string", minLength: 8 },
						},
						required: ["screen", "cta", "handoffToken"],
					},
					requestId: `live_handoff_plan_${traceId}`,
				});

				const plan = parseJsonObject(planText, [
					"screen",
					"cta",
					"handoffToken",
				]);
				expect(typeof plan.screen).toBe("string");
				expect((plan.screen as string).trim().length).toBeGreaterThanOrEqual(3);
				expect(typeof plan.cta).toBe("string");
				expect((plan.cta as string).trim().length).toBeGreaterThanOrEqual(2);
				expect(plan.handoffToken).toBe(handoffToken);

				const confirmation = await aiChatComplete({
					prompt: `Reply with exactly this token and nothing else: ${handoffToken}`,
					routeKey: "strong",
					useFast: false,
					requestId: `live_handoff_confirm_${traceId}`,
				});
				const confirmedLine = confirmation
					.trim()
					.split(/\r?\n/)
					.map((line) => line.trim())
					.filter((line) => line.length > 0)
					.at(-1);
				expect(confirmedLine).toBe(handoffToken);
			});
		},
		90_000,
	);

	run(
		"executes live retrieval journey: rewrite intent then validate embedding similarity order",
		async () => {
			await runJourneyWithEvidence("retrieval", async (traceId) => {
				const query =
					"Build a renewable energy analytics dashboard focused on solar and wind KPIs.";
				const rewritten = await aiChatComplete({
					prompt: `Rewrite this requirement in one sentence without changing meaning: ${query}`,
					routeKey: "strong",
					useFast: false,
					requestId: `live_retrieval_rewrite_${traceId}`,
				});
				const normalizedRewrite = rewritten.trim();
				expect(normalizedRewrite.length).toBeGreaterThanOrEqual(20);

				const unrelated =
					"Sourdough baking checklist with hydration, proofing, and oven spring tips.";
				const [queryEmbedding, rewriteEmbedding, unrelatedEmbedding] =
					await embedContentsWithGemini({
						contents: [query, normalizedRewrite, unrelated],
						model: getGeminiModelEmbedding(),
						outputDimensionality: 256,
					});

				expect(queryEmbedding?.length).toBe(256);
				expect(rewriteEmbedding?.length).toBe(256);
				expect(unrelatedEmbedding?.length).toBe(256);

				const rewriteSimilarity = cosineSimilarity(
					queryEmbedding ?? [],
					rewriteEmbedding ?? [],
				);
				const unrelatedSimilarity = cosineSimilarity(
					queryEmbedding ?? [],
					unrelatedEmbedding ?? [],
				);

				expect(rewriteSimilarity).toBeGreaterThan(unrelatedSimilarity);
			});
		},
		90_000,
	);

	run(
		"executes live generate-review journey: generate landing copy then run quality gate review",
		async () => {
			await runJourneyWithEvidence("generate_review", async (traceId) => {
				const draftText = await aiChatComplete({
					prompt:
						"Return JSON only with keys headline, supportingCopy, ctaLabel. " +
						"Context: draft copy for an enterprise observability landing page.",
					routeKey: "strong",
					useFast: false,
					responseMimeType: jsonMimeType,
					responseJsonSchema: {
						type: "object",
						additionalProperties: false,
						properties: {
							headline: { type: "string", minLength: 3 },
							supportingCopy: { type: "string", minLength: 20 },
							ctaLabel: { type: "string", minLength: 2 },
						},
						required: ["headline", "supportingCopy", "ctaLabel"],
					},
					requestId: `live_generate_review_draft_${traceId}`,
				});

				const draft = parseJsonObject(draftText, [
					"headline",
					"supportingCopy",
					"ctaLabel",
				]);
				const headline = String(draft.headline ?? "").trim();
				const supportingCopy = String(draft.supportingCopy ?? "").trim();
				const ctaLabel = String(draft.ctaLabel ?? "").trim();
				expect(headline.length).toBeGreaterThanOrEqual(3);
				expect(supportingCopy.length).toBeGreaterThanOrEqual(20);
				expect(ctaLabel.length).toBeGreaterThanOrEqual(2);

				const reviewText = await aiChatComplete({
					prompt:
						"Evaluate the following UI copy draft and return JSON only with keys " +
						"originalHeadline, originalCtaLabel, qualityGate, accessibilityRisk, reason. " +
						"Set originalHeadline and originalCtaLabel exactly to the input values. " +
						"qualityGate must be pass or revise. accessibilityRisk must be low, medium, or high. " +
						`Draft JSON: ${JSON.stringify(draft)}`,
					routeKey: "strong",
					useFast: false,
					responseMimeType: jsonMimeType,
					responseJsonSchema: {
						type: "object",
						additionalProperties: false,
						properties: {
							originalHeadline: { type: "string", minLength: 3 },
							originalCtaLabel: { type: "string", minLength: 2 },
							qualityGate: { type: "string", enum: ["pass", "revise"] },
							accessibilityRisk: {
								type: "string",
								enum: ["low", "medium", "high"],
							},
							reason: { type: "string", minLength: 10, maxLength: 240 },
						},
						required: [
							"originalHeadline",
							"originalCtaLabel",
							"qualityGate",
							"accessibilityRisk",
							"reason",
						],
					},
					requestId: `live_generate_review_eval_${traceId}`,
				});

				const review = parseJsonObject(reviewText, [
					"originalHeadline",
					"originalCtaLabel",
					"qualityGate",
					"accessibilityRisk",
					"reason",
				]);
				expect(review.originalHeadline).toBe(headline);
				expect(review.originalCtaLabel).toBe(ctaLabel);
				expect(["pass", "revise"]).toContain(review.qualityGate);
				expect(["low", "medium", "high"]).toContain(review.accessibilityRisk);
				expect(
					String(review.reason ?? "").trim().length,
				).toBeGreaterThanOrEqual(10);
			});
		},
		90_000,
	);

	run(
		"executes live model-intent journey: list models then produce bounded routing rationale",
		async () => {
			await runJourneyWithEvidence("model_intent", async (traceId) => {
				const models = await aiListModels(20);
				const provider = models?.primary?.provider;
				const names = Array.isArray(models?.primary?.models)
					? models.primary.models
							.slice(0, 6)
							.map((item) => String(item))
							.filter((item) => item.length > 0)
					: [];

				expect(provider).toBe("gemini");
				expect(names.length).toBeGreaterThan(0);

				const rationaleText = await aiChatComplete({
					prompt:
						"Return JSON only with keys selectedModel, confidence, rationale. " +
						`Pick selectedModel from this list exactly: ${names.join(", ")}. ` +
						"confidence must be integer 1..5. rationale must be <= 120 chars.",
					routeKey: "strong",
					useFast: false,
					responseMimeType: jsonMimeType,
					responseJsonSchema: {
						type: "object",
						additionalProperties: false,
						properties: {
							selectedModel: { type: "string", minLength: 3 },
							confidence: { type: "integer", minimum: 1, maximum: 5 },
							rationale: { type: "string", minLength: 8, maxLength: 120 },
						},
						required: ["selectedModel", "confidence", "rationale"],
					},
					requestId: `live_model_intent_${traceId}`,
				});

				const rationale = parseJsonObject(rationaleText, [
					"selectedModel",
					"confidence",
					"rationale",
				]);
				const selectedModel = String(rationale.selectedModel ?? "");
				expect(names).toContain(selectedModel);
				expect(Number(rationale.confidence)).toBeGreaterThanOrEqual(1);
				expect(Number(rationale.confidence)).toBeLessThanOrEqual(5);
				expect(
					String(rationale.rationale ?? "").trim().length,
				).toBeGreaterThanOrEqual(8);
			});
		},
		90_000,
	);
});
