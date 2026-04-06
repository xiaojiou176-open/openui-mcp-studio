"use client";

import { type FocusEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";

type UseTabScrollStateInput = {
	activeTab: string;
	query: string;
	statusFilter: string;
};

export function useTabScrollState(input: UseTabScrollStateInput) {
	const tabsListRef = useRef<HTMLDivElement | null>(null);
	const tabsScrollFrameRef = useRef<number | null>(null);
	const updateTabsScrollStateRef = useRef<() => void>(() => {});
	const [tabsReady, setTabsReady] = useState(false);
	const [tabsCanScrollLeft, setTabsCanScrollLeft] = useState(false);
	const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);

	useEffect(() => {
		const node = tabsListRef.current;
		if (!node) {
			return undefined;
		}

		const updateScrollState = () => {
			const remainingRight = node.scrollWidth - node.clientWidth - node.scrollLeft;
			const canScrollLeft = node.scrollLeft > 4;
			const canScrollRight = remainingRight > 4;
			setTabsCanScrollLeft((previous) =>
				previous === canScrollLeft ? previous : canScrollLeft,
			);
			setTabsCanScrollRight((previous) =>
				previous === canScrollRight ? previous : canScrollRight,
			);
			setTabsReady((previous) => (previous ? previous : true));
		};

		const scheduleScrollStateUpdate = () => {
			if (tabsScrollFrameRef.current !== null) {
				return;
			}
			tabsScrollFrameRef.current = window.requestAnimationFrame(() => {
				tabsScrollFrameRef.current = null;
				updateScrollState();
			});
		};

		updateTabsScrollStateRef.current = scheduleScrollStateUpdate;
		scheduleScrollStateUpdate();
		node.addEventListener("scroll", scheduleScrollStateUpdate, { passive: true });
		window.addEventListener("resize", scheduleScrollStateUpdate);
		const resizeObserver =
			typeof ResizeObserver === "undefined"
				? undefined
				: new ResizeObserver(() => {
						scheduleScrollStateUpdate();
					});
		resizeObserver?.observe(node);

		return () => {
			node.removeEventListener("scroll", scheduleScrollStateUpdate);
			window.removeEventListener("resize", scheduleScrollStateUpdate);
			resizeObserver?.disconnect();
			if (tabsScrollFrameRef.current !== null) {
				window.cancelAnimationFrame(tabsScrollFrameRef.current);
				tabsScrollFrameRef.current = null;
			}
			updateTabsScrollStateRef.current = () => {};
		};
	}, []);

	useEffect(() => {
		updateTabsScrollStateRef.current();
	}, [input.activeTab, input.query, input.statusFilter]);

	const scrollTabsBy = (offset: number) => {
		const node = tabsListRef.current;
		if (!node) {
			return;
		}

		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		node.scrollBy({
			left: offset,
			behavior: reduceMotion ? "auto" : "smooth",
		});
	};

	const handleScrollTabs = (direction: "left" | "right") => {
		const node = tabsListRef.current;
		if (!node) {
			return;
		}

		const amount = Math.max(120, Math.round(node.clientWidth * 0.7));
		scrollTabsBy(direction === "left" ? -amount : amount);
	};

	const handleTabScrollKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.defaultPrevented) {
			return;
		}

		const node = tabsListRef.current;
		const target =
			event.target instanceof HTMLElement && event.target.getAttribute("role") === "tab"
				? event.target
				: null;
		if (!node || !target) {
			return;
		}

		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
			return;
		}

		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		window.requestAnimationFrame(() => {
			const focusedTab =
				document.activeElement instanceof HTMLElement &&
				node.contains(document.activeElement) &&
				document.activeElement.getAttribute("role") === "tab"
					? document.activeElement
					: target;
			focusedTab.scrollIntoView({
				block: "nearest",
				inline: "nearest",
				behavior: reduceMotion ? "auto" : "smooth",
			});
			updateTabsScrollStateRef.current();
		});
	};

	const handleTabScrollFocus = (event: KeyboardEvent<HTMLDivElement> | FocusEvent) => {
		const node = tabsListRef.current;
		const target =
			event.target instanceof HTMLElement && event.target.getAttribute("role") === "tab"
				? event.target
				: null;
		if (!node || !target) {
			return;
		}

		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		window.requestAnimationFrame(() => {
			target.scrollIntoView({
				block: "nearest",
				inline: "nearest",
				behavior: reduceMotion ? "auto" : "smooth",
			});
			updateTabsScrollStateRef.current();
		});
	};

	return {
		handleTabScrollFocus,
		handleTabScrollKeyDown,
		handleScrollTabs,
		tabsCanScrollLeft,
		tabsCanScrollRight,
		tabsListRef,
		tabsReady,
	};
}
