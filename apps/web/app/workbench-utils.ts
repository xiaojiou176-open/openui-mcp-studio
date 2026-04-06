import type { StatusFilter, WorkItem } from "./workbench-data";

export function matchesWorkbenchFilters(
	item: WorkItem,
	normalizedQuery: string,
	statusFilter: StatusFilter,
): boolean {
	const matchesQuery =
		normalizedQuery.length === 0 ||
		item.name.toLowerCase().includes(normalizedQuery) ||
		item.summary.toLowerCase().includes(normalizedQuery) ||
		item.owner.toLowerCase().includes(normalizedQuery);
	const matchesStatus = statusFilter === "all" || item.status === statusFilter;

	return matchesQuery && matchesStatus;
}

export function simulateWorkspaceRefresh(
	signal: AbortSignal,
	successMessage: string,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(() => {
			cleanup();
			resolve(successMessage);
		}, 900);

		const handleAbort = () => {
			cleanup();
			reject(
				signal.reason ?? new DOMException("Refresh cancelled.", "AbortError"),
			);
		};

		const cleanup = () => {
			window.clearTimeout(timer);
			signal.removeEventListener("abort", handleAbort);
		};

		signal.addEventListener("abort", handleAbort, { once: true });
	});
}
