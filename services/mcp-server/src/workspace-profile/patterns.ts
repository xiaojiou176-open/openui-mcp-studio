import fs from "node:fs/promises";
import path from "node:path";
import type {
	WorkspaceComponentEntry,
	WorkspacePatternHints,
	WorkspaceProfile,
	WorkspaceRouteEntry,
} from "./types.js";
import {
	collectWorkspaceExportNames,
	listWorkspaceFilesRecursive,
} from "../../../../packages/shared-runtime/src/workspace-profile.js";
import { normalizePath } from "../../../../packages/shared-runtime/src/path-utils.js";

export function inferRouteKind(relativePath: string): WorkspaceRouteEntry["kind"] {
	if (/\/layout\.(tsx|ts|jsx|js)$/.test(relativePath)) {
		return "layout";
	}
	if (/\/route\.(tsx|ts|jsx|js)$/.test(relativePath)) {
		return "route";
	}
	if (/\/loading\.(tsx|ts|jsx|js)$/.test(relativePath)) {
		return "loading";
	}
	if (/\/error\.(tsx|ts|jsx|js)$/.test(relativePath)) {
		return "error";
	}
	return "page";
}

export function inferComponentCategory(
	relativePath: string,
	uiDir: string,
	componentsDir: string,
): WorkspaceComponentEntry["category"] {
	if (relativePath.startsWith(`${normalizePath(uiDir)}/`)) {
		return "ui";
	}
	if (relativePath.startsWith(`${normalizePath(componentsDir)}/generated/`)) {
		return "generated";
	}
	if (relativePath.startsWith(`${normalizePath(componentsDir)}/`)) {
		return "shared";
	}
	return "other";
}

export async function buildWorkspaceComponentEntries(input: {
	root: string;
	uiDir: string;
	componentsDir: string;
}): Promise<WorkspaceComponentEntry[]> {
	const candidates = await listWorkspaceFilesRecursive(input.root, (relativePath) =>
		!relativePath.startsWith(".next/") &&
		/(^|\/)components\/.*\.(tsx|ts|jsx|js)$/.test(relativePath),
	);
	const entries: WorkspaceComponentEntry[] = [];
	for (const relativePath of candidates) {
		const source = await fs
			.readFile(path.join(input.root, relativePath), "utf8")
			.catch(() => "");
		entries.push({
			filePath: relativePath,
			exportNames: collectWorkspaceExportNames(source),
			category: inferComponentCategory(relativePath, input.uiDir, input.componentsDir),
		});
	}
	return entries;
}

export async function buildWorkspacePatternHints(
	root: string,
): Promise<WorkspacePatternHints> {
	const tsFiles = await listWorkspaceFilesRecursive(root, (relativePath) =>
		!relativePath.startsWith(".next/") &&
		/\.(tsx|ts|jsx|js)$/.test(relativePath),
	);
	const formLibraries = new Set<string>();
	const formFiles: string[] = [];
	const dataLibraries = new Set<string>();
	const serverActionFiles: string[] = [];
	const clientComponentFiles: string[] = [];
	const tableFiles: string[] = [];
	const chartFiles: string[] = [];
	const navigationFiles: string[] = [];

	for (const relativePath of tsFiles) {
		const source = await fs
			.readFile(`${root}/${relativePath}`, "utf8")
			.catch(() => "");
		if (source.includes("react-hook-form")) {
			formLibraries.add("react-hook-form");
			formFiles.push(relativePath);
		}
		if (source.includes("useForm(")) {
			formLibraries.add("custom-useForm");
			formFiles.push(relativePath);
		}
		if (source.includes("@tanstack/react-query")) {
			dataLibraries.add("@tanstack/react-query");
		}
		if (source.includes("fetch(") || source.includes("await fetch(")) {
			dataLibraries.add("fetch");
		}
		if (source.includes("\"use server\"") || source.includes("'use server'")) {
			serverActionFiles.push(relativePath);
		}
		if (source.includes("\"use client\"") || source.includes("'use client'")) {
			clientComponentFiles.push(relativePath);
		}
		if (
			source.includes("<table") ||
			source.includes("DataTable") ||
			source.includes("@tanstack/react-table")
		) {
			tableFiles.push(relativePath);
		}
		if (
			/(recharts|victory|chart\.js|apexcharts|@nivo)/i.test(source) ||
			source.includes("AreaChart") ||
			source.includes("LineChart") ||
			source.includes("BarChart")
		) {
			chartFiles.push(relativePath);
		}
		if (
			/(nav|navigation|sidebar|header|menubar|breadcrumb)/i.test(relativePath) ||
			/(<nav|Sidebar|Navigation|Menubar|Breadcrumb|Header)/.test(source)
		) {
			navigationFiles.push(relativePath);
		}
	}

	return {
		formLibraries: Array.from(formLibraries).sort(),
		formFiles: Array.from(new Set(formFiles)).sort(),
		dataLibraries: Array.from(dataLibraries).sort(),
		serverActionFiles: serverActionFiles.sort(),
		clientComponentFiles: clientComponentFiles.sort(),
		tableFiles: Array.from(new Set(tableFiles)).sort(),
		chartFiles: Array.from(new Set(chartFiles)).sort(),
		navigationFiles: Array.from(new Set(navigationFiles)).sort(),
	};
}

export async function buildWorkspaceTokenHints(
	root: string,
): Promise<WorkspaceProfile["tokenHints"]> {
	const files = await listWorkspaceFilesRecursive(root, (relativePath) =>
		!relativePath.startsWith(".next/") &&
		/(tailwind\.config|globals\.css|tokens\.css|theme\.css|styles\.css|app\.css)/.test(
			relativePath,
		),
	);
	return {
		tokenFiles: files.filter((file) => /tokens\.css|theme\.css/.test(file)),
		cssVariableFiles: files.filter((file) => /\.css$/.test(file)),
		tailwindConfigFiles: files.filter((file) => /tailwind\.config/.test(file)),
	};
}
