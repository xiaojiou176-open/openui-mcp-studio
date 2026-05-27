import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	listWorkspaceFilesRecursive,
	routePathFromAppFile,
} from "../packages/shared-runtime/src/workspace-profile.js";
import { scanWorkspaceProfile } from "../services/mcp-server/src/workspace-profile.js";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("workspace-profile extra branches", () => {
	it("maps the root app page to the slash route", () => {
		expect(routePathFromAppFile("app/page.tsx")).toBe("/");
	});

	it("falls back to the normalized path when no app segment exists", () => {
		expect(routePathFromAppFile("marketing/home/page.tsx")).toBe(
			"/marketing/home",
		);
	});

	it("returns an empty result when the root cannot be read", async () => {
		const missingRoot = await mkTempDir("openui-workspace-profile-missing-");
		await fs.rm(missingRoot, { recursive: true, force: true });

		await expect(
			listWorkspaceFilesRecursive(missingRoot, () => true),
		).resolves.toEqual([]);
	});

	it("defaults to apps/web when present and keeps low-signal heuristics empty", async () => {
		const workspaceRoot = await mkTempDir(
			"openui-workspace-profile-default-app-root-",
		);
		const appRoot = path.join(workspaceRoot, "apps", "web");
		await fs.mkdir(path.join(appRoot, "app"), { recursive: true });
		await fs.mkdir(path.join(appRoot, "components", "shared"), {
			recursive: true,
		});

		await fs.writeFile(
			path.join(appRoot, "app", "page.tsx"),
			"export default function Home(){return <main>Home</main>}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "components", "shared", "card.tsx"),
			"export function Card(){return <section />}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "app", "globals.css"),
			":root { --brand: #000; }\n",
		);

		const profile = await scanWorkspaceProfile({
			workspaceRoot,
		});

		expect(profile.defaultTargetRoot).toBe("apps/web");
		expect(profile.routingMode).toBe("app-router");
		expect(profile.routeGroups).toEqual([]);
		expect(profile.parallelRouteKeys).toEqual([]);
		expect(profile.patternHints.formFiles).toEqual([]);
		expect(profile.patternHints.tableFiles).toEqual([]);
		expect(profile.patternHints.chartFiles).toEqual([]);
		expect(profile.patternHints.navigationFiles).toEqual([]);
		expect(profile.hotspots).toEqual([]);
		expect(profile.evidenceAnchors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					area: "routing",
					filePath: "app/page.tsx",
				}),
				expect.objectContaining({
					area: "styling",
					filePath: "app/globals.css",
				}),
			]),
		);
	});

	it("falls back to the workspace root when apps/web is absent", async () => {
		const workspaceRoot = await mkTempDir(
			"openui-workspace-profile-default-dot-root-",
		);
		await fs.mkdir(path.join(workspaceRoot, "app", "settings"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(workspaceRoot, "app", "settings", "page.tsx"),
			"export default function Settings(){return <main>Settings</main>}\n",
		);

		const profile = await scanWorkspaceProfile({
			workspaceRoot,
		});

		expect(profile.defaultTargetRoot).toBe(".");
		expect(profile.routeEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: "app/settings/page.tsx",
					routePath: "/settings",
				}),
			]),
		);
		expect(profile.unknowns).toEqual(
			expect.arrayContaining([
				expect.stringContaining("No component inventory"),
				expect.stringContaining("No obvious CSS variable"),
			]),
		);
	});

	it("auto-detects apps/web, ignores generated internals, and infers a tailwind-only stack", async () => {
		const workspaceRoot = await mkTempDir("openui-workspace-profile-apps-web-");
		const appRoot = path.join(workspaceRoot, "apps", "web");
		await fs.mkdir(path.join(appRoot, "app", "dashboard"), { recursive: true });
		await fs.mkdir(path.join(appRoot, "components", "navigation"), {
			recursive: true,
		});
		await fs.mkdir(path.join(appRoot, "node_modules", "ignored", "app"), {
			recursive: true,
		});
		await fs.mkdir(path.join(appRoot, ".next", "ignored", "app"), {
			recursive: true,
		});
		await fs.mkdir(path.join(appRoot, ".git", "ignored"), { recursive: true });

		await fs.writeFile(
			path.join(appRoot, "app", "dashboard", "page.tsx"),
			"export default function Dashboard(){return <main>Dashboard</main>}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "tailwind.config.ts"),
			"export default {};\n",
		);
		await fs.writeFile(
			path.join(appRoot, "components", "navigation", "header.tsx"),
			"'use client'\nexport function Header(){return <nav />}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "settings-form.tsx"),
			"'use client'\nimport { useForm } from \"react-hook-form\";\nexport function SettingsForm(){useForm(); return <form />}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "dashboard-table.tsx"),
			"'use client'\nexport function DashboardTable(){return <table><tbody /></table>}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "sales-chart.tsx"),
			"'use client'\nexport function SalesChart(){return <LineChart />}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "node_modules", "ignored", "app", "page.tsx"),
			"export default function Ignored(){return null}\n",
		);
		await fs.writeFile(
			path.join(appRoot, ".next", "ignored", "app", "page.tsx"),
			"export default function Ignored(){return null}\n",
		);

		const profile = await scanWorkspaceProfile({
			workspaceRoot,
		});

		expect(profile.defaultTargetRoot).toBe("apps/web");
		expect(profile.routingMode).toBe("app-router");
		expect(profile.styleStack).toMatchObject({
			usesComponentsJson: false,
			usesTailwindConfig: true,
			usesCssVariables: false,
			tokenAuthority: "tailwind-only",
		});
		expect(profile.routeEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: "app/dashboard/page.tsx",
					routePath: "/dashboard",
				}),
			]),
		);
		expect(
			profile.routeEntries.some(
				(entry) =>
					entry.filePath.includes("node_modules") ||
					entry.filePath.includes(".next") ||
					entry.filePath.includes(".git"),
			),
		).toBe(false);
		expect(profile.patternHints.formFiles).toContain("settings-form.tsx");
		expect(profile.patternHints.tableFiles).toContain("dashboard-table.tsx");
		expect(profile.patternHints.chartFiles).toContain("sales-chart.tsx");
		expect(profile.patternHints.navigationFiles).toContain(
			"components/navigation/header.tsx",
		);
		expect(profile.evidenceAnchors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					area: "patterns",
					label: "navigation-surface",
					filePath: "components/navigation/header.tsx",
				}),
			]),
		);
		expect(profile.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "form-surface" }),
				expect.objectContaining({ kind: "table-surface" }),
				expect.objectContaining({ kind: "chart-surface" }),
				expect.objectContaining({ kind: "navigation-surface" }),
			]),
		);
		expect(profile.confidence?.overall).toBe("high");
		expect(profile.unknowns).toEqual(
			expect.arrayContaining([
				expect.stringContaining("No obvious CSS variable"),
			]),
		);
	});

	it("captures mixed routing, unknown token authority, and the first two evidence anchors per pattern family", async () => {
		const workspaceRoot = await mkTempDir("openui-workspace-profile-mixed-");
		await fs.mkdir(
			path.join(workspaceRoot, "app", "(admin)", "@drawer", "reports"),
			{
				recursive: true,
			},
		);
		await fs.mkdir(path.join(workspaceRoot, "pages", "reports"), {
			recursive: true,
		});
		await fs.mkdir(path.join(workspaceRoot, "components", "navigation"), {
			recursive: true,
		});

		await fs.writeFile(
			path.join(
				workspaceRoot,
				"app",
				"(admin)",
				"@drawer",
				"reports",
				"layout.tsx",
			),
			"export default function Layout({ children }) { return children; }\n",
		);
		await fs.writeFile(
			path.join(
				workspaceRoot,
				"app",
				"(admin)",
				"@drawer",
				"reports",
				"page.tsx",
			),
			"export default function Reports(){return <main>Reports</main>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "pages", "reports", "index.tsx"),
			"export default function ReportsIndex(){return <main>Reports Index</main>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "components", "navigation", "primary-nav.tsx"),
			"'use client'\nexport function PrimaryNav(){return <nav />}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "components", "navigation", "secondary-nav.tsx"),
			"'use client'\nexport function SecondaryNav(){return <nav />}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "report-form.tsx"),
			"'use client'\nimport { useForm } from \"react-hook-form\";\nexport function ReportForm(){useForm(); return <form />}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "report-table.tsx"),
			"'use client'\nexport function ReportTable(){return <table><tbody /></table>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "report-chart.tsx"),
			"'use client'\nexport function ReportChart(){return <LineChart />}\n",
		);

		const profile = await scanWorkspaceProfile({
			workspaceRoot,
			targetRoot: ".",
		});

		expect(profile.routingMode).toBe("mixed");
		expect(profile.routeGroups).toEqual(["admin"]);
		expect(profile.parallelRouteKeys).toEqual(["drawer"]);
		expect(profile.styleStack).toMatchObject({
			usesCssVariables: false,
			usesTailwindConfig: false,
			tokenAuthority: "unknown",
		});
		expect(profile.unknowns).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Both app-router and pages-router"),
				expect.stringContaining("No obvious CSS variable"),
			]),
		);
		expect(profile.evidenceAnchors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					area: "patterns",
					label: "table-surface",
					filePath: "report-table.tsx",
				}),
				expect.objectContaining({
					area: "patterns",
					label: "navigation-surface",
					filePath: "components/navigation/primary-nav.tsx",
				}),
			]),
		);
		expect(profile.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "route-group", label: "admin" }),
				expect.objectContaining({ kind: "parallel-route", label: "drawer" }),
				expect.objectContaining({
					kind: "form-surface",
					filePath: "report-form.tsx",
				}),
				expect.objectContaining({
					kind: "table-surface",
					filePath: "report-table.tsx",
				}),
				expect.objectContaining({
					kind: "chart-surface",
					filePath: "report-chart.tsx",
				}),
				expect.objectContaining({
					kind: "navigation-surface",
					filePath: "components/navigation/primary-nav.tsx",
				}),
				expect.objectContaining({
					kind: "token-authority",
					label: "styling-unknown",
				}),
			]),
		);
	});
});
