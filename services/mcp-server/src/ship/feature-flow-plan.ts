import type {
	FeatureFlowDefinition,
	FeatureFlowPlanSummary,
} from "../../../../packages/contracts/src/feature-flow.js";

export function buildFeatureFlowPlan(
	input: FeatureFlowDefinition,
): FeatureFlowPlanSummary {
	return {
		version: 1 as const,
		name: input.name,
		description: input.description,
		routeCount: input.routes.length,
		routeIds: input.routes.map((route) => route.id),
		pagePaths: input.routes.map((route) => route.pagePath),
		sharedComponentsDir: input.sharedComponentsDir ?? null,
		layoutPath: input.layoutPath ?? null,
	};
}
