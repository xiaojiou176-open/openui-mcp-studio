import { z } from "zod";

const UiuxAuditCategoryIdSchema = z.enum([
	"hierarchy",
	"consistency",
	"design_system",
	"interaction_clarity",
	"accessibility",
]);

const UiuxAuditCategoryStatusSchema = z.enum(["pass", "watch", "fail"]);

const UiuxStylePackRubricItemSchema = z.object({
	id: UiuxAuditCategoryIdSchema,
	label: z.string().min(1),
	goal: z.string().min(1),
	signals: z.array(z.string().min(1)).min(1),
});

const UiuxStylePackSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	summary: z.string().min(1),
	emphasis: z.enum(["balanced", "operator_dense"]),
	tokenMode: z.literal("semantic-css-variables"),
	themeModes: z.array(z.enum(["light", "dark"])).min(1),
	surfaceTokens: z.array(z.string().min(1)).min(1),
	focusRingToken: z.string().min(1),
	spacingScalePx: z.array(z.number().int().nonnegative()).min(1),
	radiusTokens: z.array(z.string().min(1)).min(1),
	hierarchyRule: z.string().min(1),
	primaryActionRule: z.string().min(1),
	rubric: z.array(UiuxStylePackRubricItemSchema).length(5),
});

const UiuxStylePackContractSchema = z.object({
	tokenMode: z.literal("semantic-css-variables"),
	hierarchyRule: z.string().min(1),
	primaryActionRule: z.string().min(1),
	rubric: z.array(UiuxStylePackRubricItemSchema).length(5),
});

const UiuxStylePackSummarySchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	summary: z.string().min(1),
	emphasis: z.enum(["balanced", "operator_dense"]),
	themeModes: z.array(z.enum(["light", "dark"])).min(1),
	surfaceTokens: z.array(z.string().min(1)).min(1),
	focusRingToken: z.string().min(1),
	spacingScalePx: z.array(z.number().int().nonnegative()).min(1),
	radiusTokens: z.array(z.string().min(1)).min(1),
	contract: UiuxStylePackContractSchema,
});

const UiuxAuditCategorySummarySchema = z.object({
	id: UiuxAuditCategoryIdSchema,
	label: z.string().min(1),
	status: UiuxAuditCategoryStatusSchema,
	summary: z.string().min(1),
	issueCount: z.number().int().nonnegative(),
	blockingIssueCount: z.number().int().nonnegative(),
	highlights: z.array(z.string().min(1)).max(3),
});

const UiuxAuditNextStepSchema = z.object({
	priority: z.enum(["now", "next", "later"]),
	category: UiuxAuditCategoryIdSchema,
	title: z.string().min(1),
	detail: z.string().min(1),
});

const UiuxAuditFileHotspotSchema = z.object({
	file: z.string().min(1),
	issueCount: z.number().int().nonnegative(),
	categories: z.array(UiuxAuditCategoryIdSchema),
});

const UiuxAuditAutomatedSignalsSchema = z.object({
	verdict: UiuxAuditCategoryStatusSchema,
	issueCount: z.number().int().nonnegative(),
	blockingIssueCount: z.number().int().nonnegative(),
	failingCategoryCount: z.number().int().nonnegative(),
	watchedCategoryCount: z.number().int().nonnegative(),
	hotspotCount: z.number().int().nonnegative(),
	sourceKinds: z.array(z.enum(["heuristic", "model"])),
});

const UiuxAuditManualReviewSchema = z.object({
	required: z.boolean(),
	reason: z.string().min(1),
	focusAreas: z.array(UiuxAuditCategoryIdSchema).max(3),
});

const UiuxAuditFrameSchema = z.object({
	scope: z.enum(["snippet", "page", "workspace"]),
	target: z.string().min(1),
	summary: z.string().min(1),
	stylePack: UiuxStylePackSummarySchema,
	categories: z.array(UiuxAuditCategorySummarySchema).length(5),
	automatedSignals: UiuxAuditAutomatedSignalsSchema,
	manualReview: UiuxAuditManualReviewSchema,
	nextOperatorMove: UiuxAuditNextStepSchema.nullable(),
	nextSteps: z.array(UiuxAuditNextStepSchema).max(3),
	fileHotspots: z.array(UiuxAuditFileHotspotSchema).max(5).default([]),
	auditableFileCount: z.number().int().nonnegative().optional(),
});

type UiuxAuditCategoryId = z.infer<typeof UiuxAuditCategoryIdSchema>;
type UiuxStylePack = z.infer<typeof UiuxStylePackSchema>;
type UiuxAuditCategorySummary = z.infer<
	typeof UiuxAuditCategorySummarySchema
>;
type UiuxAuditNextStep = z.infer<typeof UiuxAuditNextStepSchema>;
type UiuxAuditFrame = z.infer<typeof UiuxAuditFrameSchema>;
type UiuxStylePackSummary = z.infer<typeof UiuxStylePackSummarySchema>;

type AuditIssueLike = {
	id?: string;
	severity: string;
	title?: string;
	detail?: string;
	recommendation?: string;
	confidence?: string;
	impact?: string;
	priority?: string;
	principle?: string;
	taskFlowImpact?: boolean;
	category?: string;
	message?: string;
	fix?: string;
	file?: string;
	source?: string;
};

type BuildUiuxAuditFrameOptions = {
	scope: "snippet" | "page" | "workspace";
	target: string;
	stylePackId?: string;
	issues: AuditIssueLike[];
	fileHotspots?: Array<{
		file: string;
		issueCount: number;
		categories: UiuxAuditCategoryId[];
	}>;
	auditableFileCount?: number;
};

const DEFAULT_UIUX_STYLE_PACK_ID = "openui-studio";

const CATEGORY_LABELS: Record<UiuxAuditCategoryId, string> = {
	hierarchy: "Hierarchy",
	consistency: "Consistency",
	design_system: "Design system",
	interaction_clarity: "Interaction clarity",
	accessibility: "Accessibility",
};

const CATEGORY_ORDER_BY_EMPHASIS: Record<
	UiuxStylePack["emphasis"],
	UiuxAuditCategoryId[]
> = {
	balanced: [
		"hierarchy",
		"consistency",
		"design_system",
		"interaction_clarity",
		"accessibility",
	],
	operator_dense: [
		"interaction_clarity",
		"consistency",
		"hierarchy",
		"design_system",
		"accessibility",
	],
};

const HIGH_SEVERITY_TOKENS = new Set(["high", "error"]);
const MEDIUM_SEVERITY_TOKENS = new Set(["medium", "warning"]);

const OPENUI_STYLE_PACKS = Object.freeze({
	"openui-studio": UiuxStylePackSchema.parse({
		id: "openui-studio",
		label: "OpenUI Studio",
		summary:
			"Proof-first, token-led review pack for OpenUI frontdoor, proof desk, and workbench surfaces.",
		emphasis: "balanced",
		tokenMode: "semantic-css-variables",
		themeModes: ["light", "dark"],
		surfaceTokens: [
			"background",
			"foreground",
			"surface-1",
			"surface-2",
			"surface-3",
			"border",
			"primary",
			"success",
			"success-soft",
		],
		focusRingToken: "ring",
		spacingScalePx: [0, 4, 6, 8, 12, 16, 24, 32, 48, 64],
		radiusTokens: ["radius", "radius-xl"],
		hierarchyRule:
			"Keep one dominant page heading and one dominant action per decision region.",
		primaryActionRule:
			"Primary actions should stay singular, visible, and easy to distinguish from proof/support actions.",
		rubric: [
			{
				id: "hierarchy",
				label: "Hierarchy",
				goal:
					"Page and section structure should reveal what matters first without making the user guess.",
				signals: [
					"exactly one clear page-level heading",
					"dominant CTA does not compete with side actions",
					"section nesting reads in a stable order",
				],
			},
			{
				id: "consistency",
				label: "Consistency",
				goal:
					"Spacing, states, and responsive behavior should feel like one deliberate system instead of local exceptions.",
				signals: [
					"approved spacing rhythm is respected",
					"loading/error/empty/success states are represented",
					"responsive behavior does not change interaction meaning",
				],
			},
			{
				id: "design_system",
				label: "Design system",
				goal:
					"Surface styling should come from semantic tokens and shared primitives, not one-off literals.",
				signals: [
					"semantic CSS variables drive color and surface usage",
					"focus ring uses shared token treatment",
					"hardcoded color drift is treated as a contract smell",
				],
			},
			{
				id: "interaction_clarity",
				label: "Interaction clarity",
				goal:
					"Operators should understand the next action, state, and recovery path at a glance.",
				signals: [
					"dialogs and task flows advertise safe exits",
					"state transitions expose progress and recovery cues",
					"primary and secondary actions stay distinguishable",
				],
			},
			{
				id: "accessibility",
				label: "Accessibility",
				goal:
					"Keyboard, semantics, contrast, and target sizing remain first-class, not cleanup work.",
				signals: [
					"semantic landmarks and labels are present",
					"focus is visible and not obscured",
					"contrast and target-size risks are surfaced early",
				],
			},
		],
	}),
	"openui-operator-desk": UiuxStylePackSchema.parse({
		id: "openui-operator-desk",
		label: "OpenUI Operator Desk",
		summary:
			"Denser operator/reviewer preset that biases toward next-step clarity, state visibility, and supportable audit surfaces.",
		emphasis: "operator_dense",
		tokenMode: "semantic-css-variables",
		themeModes: ["light", "dark"],
		surfaceTokens: [
			"background",
			"foreground",
			"surface-1",
			"surface-2",
			"surface-3",
			"border",
			"primary",
			"success",
			"success-soft",
		],
		focusRingToken: "ring",
		spacingScalePx: [0, 4, 6, 8, 12, 16, 24, 32, 48, 64],
		radiusTokens: ["radius", "radius-xl"],
		hierarchyRule:
			"Dense operator surfaces must still show one dominant next move before supporting evidence lanes.",
		primaryActionRule:
			"Action-heavy views should preserve one clear next step and demote diagnostics or secondary follow-up actions.",
		rubric: [
			{
				id: "hierarchy",
				label: "Hierarchy",
				goal:
					"Even dense desks should show one current decision first, then evidence and supporting context.",
				signals: [
					"headline reflects the current operator decision",
					"supporting evidence does not outrank the current action",
					"review lanes stay visually grouped",
				],
			},
			{
				id: "consistency",
				label: "Consistency",
				goal:
					"Operational states and evidence rows should stay rhythmically aligned across surfaces.",
				signals: [
					"state cards use repeatable spacing and naming",
					"success/error/proof lanes stay structurally parallel",
					"responsive collapse does not hide critical actions",
				],
			},
			{
				id: "design_system",
				label: "Design system",
				goal:
					"Operator surfaces still inherit the shared token spine instead of inventing a second local palette.",
				signals: [
					"surface tokens stay semantic",
					"focus ring and border treatments are shared",
					"diagnostic emphasis does not bypass theme tokens",
				],
			},
			{
				id: "interaction_clarity",
				label: "Interaction clarity",
				goal:
					"Every state should tell the operator what to do now, what is blocked, and what can wait.",
				signals: [
					"next-step language is explicit",
					"blocking states expose recovery paths",
					"dialogs and confirmations preserve escape hatches",
				],
			},
			{
				id: "accessibility",
				label: "Accessibility",
				goal:
					"Compact evidence-dense layouts still need keyboard, focus, and contrast guarantees.",
				signals: [
					"focus and skip behavior survive dense chrome",
					"status and contrast signals remain legible",
					"touch and keyboard targets remain operable",
				],
			},
		],
	}),
});

function toStylePackSummary(pack: UiuxStylePack): UiuxStylePackSummary {
	return UiuxStylePackSummarySchema.parse({
		id: pack.id,
		label: pack.label,
		summary: pack.summary,
		emphasis: pack.emphasis,
		themeModes: pack.themeModes,
		surfaceTokens: pack.surfaceTokens,
		focusRingToken: pack.focusRingToken,
		spacingScalePx: pack.spacingScalePx,
		radiusTokens: pack.radiusTokens,
		contract: {
			tokenMode: pack.tokenMode,
			hierarchyRule: pack.hierarchyRule,
			primaryActionRule: pack.primaryActionRule,
			rubric: pack.rubric,
		},
	});
}

function normalizeIssueSeverity(value: string): "high" | "medium" | "low" {
	if (HIGH_SEVERITY_TOKENS.has(value)) {
		return "high";
	}
	if (MEDIUM_SEVERITY_TOKENS.has(value)) {
		return "medium";
	}
	return "low";
}

function categorizeAuditIssue(issue: AuditIssueLike): UiuxAuditCategoryId {
	const joined = [
		issue.id,
		issue.category,
		issue.priority,
		issue.principle,
		issue.title,
		issue.detail,
		issue.message,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

	if (
		issue.category === "design_system" ||
		joined.includes("design token") ||
		joined.includes("design_system") ||
		joined.includes("token-color-hardcoded")
	) {
		return "design_system";
	}
	if (
		joined.includes("missing-h1") ||
		joined.includes("multiple-h1") ||
		joined.includes("hierarchy") ||
		joined.includes("primary-action-overload")
	) {
		return "hierarchy";
	}
	if (
		issue.category === "accessibility" ||
		joined.includes("wcag") ||
		joined.includes("keyboard") ||
		joined.includes("aria") ||
		joined.includes("focus") ||
		joined.includes("contrast") ||
		joined.includes("alt") ||
		joined.includes("label") ||
		joined.includes("touch-target") ||
		joined.includes("skip link")
	) {
		return "accessibility";
	}
	if (
		issue.category === "responsive" ||
		joined.includes("spacing-scale-inconsistent") ||
		joined.includes("state-") ||
		joined.includes("responsive") ||
		joined.includes("consistency")
	) {
		return "consistency";
	}
	return "interaction_clarity";
}

function getIssueHeadline(issue: AuditIssueLike): string {
	return (
		issue.title?.trim() ||
		issue.message?.trim() ||
		issue.id?.trim() ||
		"needs follow-up"
	);
}

function getIssueRecommendation(issue: AuditIssueLike): string {
	return (
		issue.recommendation?.trim() ||
		issue.fix?.trim() ||
		"Review the affected surface and align it with the current UI/UX contract."
	);
}

function getCategoryStatus(input: {
	issueCount: number;
	blockingIssueCount: number;
}): z.infer<typeof UiuxAuditCategoryStatusSchema> {
	if (input.blockingIssueCount > 0) {
		return "fail";
	}
	if (input.issueCount > 0) {
		return "watch";
	}
	return "pass";
}

function normalizeAuditSource(
	value: string | undefined,
): "heuristic" | "model" | undefined {
	if (value === "heuristic" || value === "model") {
		return value;
	}
	return undefined;
}

function getIssuePriorityRank(issue: AuditIssueLike): number {
	const priority = issue.priority?.toLowerCase();
	if (priority === "p1") {
		return 0;
	}
	if (priority === "p2") {
		return 1;
	}
	if (priority === "p3") {
		return 2;
	}
	if (priority === "p4") {
		return 3;
	}
	const severity = normalizeIssueSeverity(issue.severity);
	if (severity === "high") {
		return 0;
	}
	if (severity === "medium") {
		return 1;
	}
	return 2;
}

function sortIssuesForAction(input: AuditIssueLike[]): AuditIssueLike[] {
	return [...input].sort((left, right) => {
		const severityDelta =
			getIssuePriorityRank(left) - getIssuePriorityRank(right);
		if (severityDelta !== 0) {
			return severityDelta;
		}
		return getIssueHeadline(left).localeCompare(getIssueHeadline(right));
	});
}

function buildCategorySummary(input: {
	categoryId: UiuxAuditCategoryId;
	pack: UiuxStylePack;
	issues: AuditIssueLike[];
}): UiuxAuditCategorySummary {
	const rubricItem = input.pack.rubric.find(
		(item) => item.id === input.categoryId,
	);
	if (!rubricItem) {
		throw new Error(`Missing rubric for category ${input.categoryId}.`);
	}
	const orderedIssues = sortIssuesForAction(input.issues);
	const blockingIssueCount = orderedIssues.filter(
		(issue) => normalizeIssueSeverity(issue.severity) === "high",
	).length;
	const status = getCategoryStatus({
		issueCount: orderedIssues.length,
		blockingIssueCount,
	});
	const highlights =
		orderedIssues.length === 0
			? [rubricItem.goal]
			: orderedIssues.slice(0, 3).map((issue) => getIssueHeadline(issue));

	const summary =
		orderedIssues.length === 0
			? `${rubricItem.label} matches the ${input.pack.label} contract.`
			: `${rubricItem.label} has ${orderedIssues.length} signal(s) against the current ${input.pack.label} goal: ${rubricItem.goal}`;

	return UiuxAuditCategorySummarySchema.parse({
		id: input.categoryId,
		label: CATEGORY_LABELS[input.categoryId],
		status,
		summary,
		issueCount: orderedIssues.length,
		blockingIssueCount,
		highlights,
	});
}

function buildNextSteps(input: {
	pack: UiuxStylePack;
	categorySummaries: UiuxAuditCategorySummary[];
	issuesByCategory: Map<UiuxAuditCategoryId, AuditIssueLike[]>;
}): UiuxAuditNextStep[] {
	const categoryPriority = CATEGORY_ORDER_BY_EMPHASIS[input.pack.emphasis];
	const rankedCategories = [...input.categorySummaries].sort((left, right) => {
		const statusRank = { fail: 0, watch: 1, pass: 2 } as const;
		const statusDelta =
			statusRank[left.status] - statusRank[right.status];
		if (statusDelta !== 0) {
			return statusDelta;
		}
		if (left.issueCount !== right.issueCount) {
			return right.issueCount - left.issueCount;
		}
		return (
			categoryPriority.indexOf(left.id) - categoryPriority.indexOf(right.id)
		);
	});

	return rankedCategories
		.filter((category) => category.status !== "pass")
		.slice(0, 3)
		.map((category, index) => {
			const leadingIssue = sortIssuesForAction(
				input.issuesByCategory.get(category.id) ?? [],
			)[0];
			const priority: UiuxAuditNextStep["priority"] =
				index === 0 ? "now" : index === 1 ? "next" : "later";
			return UiuxAuditNextStepSchema.parse({
				priority,
				category: category.id,
				title:
					leadingIssue?.title?.trim() ||
					`${category.label} needs follow-up`,
				detail: leadingIssue
					? getIssueRecommendation(leadingIssue)
					: `Review the ${category.label.toLowerCase()} rubric and align the surface with the ${input.pack.label} contract.`,
			});
		});
}

function buildAutomatedSignals(input: {
	issues: AuditIssueLike[];
	categorySummaries: UiuxAuditCategorySummary[];
	fileHotspots: UiuxAuditFrame["fileHotspots"];
}) {
	const blockingIssueCount = input.categorySummaries.reduce(
		(sum, category) => sum + category.blockingIssueCount,
		0,
	);
	const failingCategoryCount = input.categorySummaries.filter(
		(category) => category.status === "fail",
	).length;
	const watchedCategoryCount = input.categorySummaries.filter(
		(category) => category.status === "watch",
	).length;
	const verdict = getCategoryStatus({
		issueCount: failingCategoryCount + watchedCategoryCount,
		blockingIssueCount: failingCategoryCount,
	});
	const sourceKinds = Array.from(
		new Set(
			input.issues
				.map((issue) => normalizeAuditSource(issue.source))
				.filter((value): value is "heuristic" | "model" => Boolean(value)),
		),
	).sort();

	return UiuxAuditAutomatedSignalsSchema.parse({
		verdict,
		issueCount: input.issues.length,
		blockingIssueCount,
		failingCategoryCount,
		watchedCategoryCount,
		hotspotCount: input.fileHotspots.length,
		sourceKinds,
	});
}

function buildManualReview(input: {
	automatedSignals: z.infer<typeof UiuxAuditAutomatedSignalsSchema>;
	nextSteps: UiuxAuditNextStep[];
}) {
	if (input.automatedSignals.verdict === "fail") {
		return UiuxAuditManualReviewSchema.parse({
			required: true,
			reason:
				"Automated signals found blocking rubric gaps. A human should confirm intent, recovery language, and operator-safe sequencing before treating this surface as ready.",
			focusAreas: input.nextSteps.map((step) => step.category),
		});
	}
	if (input.automatedSignals.verdict === "watch") {
		return UiuxAuditManualReviewSchema.parse({
			required: true,
			reason:
				"Automated signals found watch-list drift. A human should decide whether the remaining gaps are intentional trade-offs or real UI/UX debt.",
			focusAreas: input.nextSteps.map((step) => step.category),
		});
	}
	return UiuxAuditManualReviewSchema.parse({
		required: false,
		reason:
			"Automated signals are currently clear. Keep manual review in the normal release path rather than as a special blocker.",
		focusAreas: [],
	});
}

function buildFrameSummary(input: {
	scope: BuildUiuxAuditFrameOptions["scope"];
	target: string;
	pack: UiuxStylePack;
	categorySummaries: UiuxAuditCategorySummary[];
	auditableFileCount?: number;
}): string {
	const failingCategories = input.categorySummaries.filter(
		(item) => item.status === "fail",
	);
	const watchCategories = input.categorySummaries.filter(
		(item) => item.status === "watch",
	);
	const scopeLabel =
		input.scope === "workspace"
			? `workspace audit for ${input.target}`
			: `${input.scope} audit for ${input.target}`;
	const fileSuffix =
		typeof input.auditableFileCount === "number"
			? ` across ${input.auditableFileCount} audited file(s)`
			: "";
	if (failingCategories.length > 0) {
		return `${scopeLabel}${fileSuffix} is failing ${failingCategories.length} ${input.pack.label} rubric area(s) and watching ${watchCategories.length} more.`;
	}
	if (watchCategories.length > 0) {
		return `${scopeLabel}${fileSuffix} is clear of blocking gaps but still watching ${watchCategories.length} ${input.pack.label} rubric area(s).`;
	}
	return `${scopeLabel}${fileSuffix} matches the current ${input.pack.label} rubric across hierarchy, consistency, design-system, interaction, and accessibility checks.`;
}

function normalizeFileHotspots(
	value: BuildUiuxAuditFrameOptions["fileHotspots"],
): UiuxAuditFrame["fileHotspots"] {
	return (value ?? []).slice(0, 5).map((item) =>
		UiuxAuditFileHotspotSchema.parse({
			file: item.file,
			issueCount: item.issueCount,
			categories: Array.from(new Set(item.categories)),
		}),
	);
}

function buildUiuxAuditFrame(
	options: BuildUiuxAuditFrameOptions,
): UiuxAuditFrame {
	const pack = resolveUiuxStylePack(options.stylePackId);
	const issuesByCategory = new Map<UiuxAuditCategoryId, AuditIssueLike[]>();

	for (const categoryId of CATEGORY_ORDER_BY_EMPHASIS[pack.emphasis]) {
		issuesByCategory.set(categoryId, []);
	}

	for (const issue of options.issues) {
		const categoryId = categorizeAuditIssue(issue);
		const bucket = issuesByCategory.get(categoryId);
		if (bucket) {
			bucket.push(issue);
		}
	}

	const categorySummaries = CATEGORY_ORDER_BY_EMPHASIS[pack.emphasis].map(
		(categoryId) =>
			buildCategorySummary({
				categoryId,
				pack,
				issues: issuesByCategory.get(categoryId) ?? [],
			}),
	);

	const nextSteps = buildNextSteps({
		pack,
		categorySummaries,
		issuesByCategory,
	});
	const fileHotspots = normalizeFileHotspots(options.fileHotspots);
	const automatedSignals = buildAutomatedSignals({
		issues: options.issues,
		categorySummaries,
		fileHotspots,
	});
	const manualReview = buildManualReview({
		automatedSignals,
		nextSteps,
	});

	return UiuxAuditFrameSchema.parse({
		scope: options.scope,
		target: options.target,
		summary: buildFrameSummary({
			scope: options.scope,
			target: options.target,
			pack,
			categorySummaries,
			auditableFileCount: options.auditableFileCount,
		}),
		stylePack: toStylePackSummary(pack),
		categories: categorySummaries,
		automatedSignals,
		manualReview,
		nextOperatorMove: nextSteps[0] ?? null,
		nextSteps,
		fileHotspots,
		auditableFileCount: options.auditableFileCount,
	});
}

function buildUiuxStylePromptContext(pack: UiuxStylePack): string {
	const rubricLines = pack.rubric.map(
		(item, index) =>
			`${String(index + 1)}) ${item.label}: ${item.goal} Signals: ${item.signals.join("; ")}`,
	);
	return [
		`Style pack: ${pack.id} (${pack.label})`,
		`Summary: ${pack.summary}`,
		`Emphasis: ${pack.emphasis}`,
		`Theme modes: ${pack.themeModes.join(", ")}`,
		`Surface tokens: ${pack.surfaceTokens.join(", ")}`,
		`Focus ring token: ${pack.focusRingToken}`,
		`Spacing scale px: ${pack.spacingScalePx.join(", ")}`,
		`Radius tokens: ${pack.radiusTokens.join(", ")}`,
		`Hierarchy rule: ${pack.hierarchyRule}`,
		`Primary action rule: ${pack.primaryActionRule}`,
		"Rubric:",
		...rubricLines,
	].join("\n");
}

function listUiuxStylePacks(): UiuxStylePack[] {
	return Object.values(OPENUI_STYLE_PACKS);
}

function resolveUiuxStylePack(stylePackId?: string): UiuxStylePack {
	const resolvedId = stylePackId?.trim() || DEFAULT_UIUX_STYLE_PACK_ID;
	const pack = OPENUI_STYLE_PACKS[resolvedId as keyof typeof OPENUI_STYLE_PACKS];
	if (!pack) {
		throw new Error(
			`Unknown UIUX style pack: ${resolvedId}. Available packs: ${listUiuxStylePacks()
				.map((item) => item.id)
				.join(", ")}.`,
		);
	}
	return pack;
}

export {
	DEFAULT_UIUX_STYLE_PACK_ID,
	UiuxAuditCategoryIdSchema,
	UiuxAuditFrameSchema,
	UiuxAuditNextStepSchema,
	UiuxStylePackSchema,
	buildUiuxAuditFrame,
	buildUiuxStylePromptContext,
	categorizeAuditIssue,
	listUiuxStylePacks,
	resolveUiuxStylePack,
};

export type {
	AuditIssueLike,
	BuildUiuxAuditFrameOptions,
	UiuxAuditCategoryId,
	UiuxAuditFrame,
	UiuxAuditNextStep,
	UiuxStylePack,
};
