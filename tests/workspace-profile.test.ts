import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

describe("workspace profile", () => {
	it("scans routes, components, tokens, and pattern hints from the target workspace", async () => {
		const workspaceRoot = await mkTempDir("openui-workspace-profile-");
		const appRoot = path.join(workspaceRoot, "apps", "web");
		await fs.mkdir(path.join(appRoot, "app", "dashboard"), { recursive: true });
		await fs.mkdir(path.join(appRoot, "components", "ui"), { recursive: true });
		await fs.mkdir(path.join(appRoot, "components", "shared"), {
			recursive: true,
		});

		await fs.writeFile(
			path.join(appRoot, "components.json"),
			JSON.stringify({
				aliases: {
					ui: "@/components/ui",
					components: "@/components",
				},
			}),
		);
		await fs.writeFile(
			path.join(appRoot, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: {
						"@/*": ["./*"],
					},
				},
			}),
		);
		await fs.writeFile(
			path.join(appRoot, "app", "page.tsx"),
			'export default function Page(){return <main className="p-6">Home</main>}\n',
		);
		await fs.writeFile(
			path.join(appRoot, "app", "dashboard", "layout.tsx"),
			"export default function Layout({children}:{children: React.ReactNode}){return <section>{children}</section>}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "components", "shared", "hero.tsx"),
			"'use client'\nexport function Hero(){return <div />}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "app", "globals.css"),
			":root { --brand: #000; }\n",
		);

		const profile = await scanWorkspaceProfile({
			workspaceRoot,
			targetRoot: "apps/web",
		});

		expect(profile.defaultTargetRoot).toBe("apps/web");
		expect(profile.routingMode).toBe("app-router");
		expect(profile.routeEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					routePath: "/",
					kind: "page",
					sourceRoot: "app",
				}),
				expect.objectContaining({
					routePath: "/dashboard",
					kind: "layout",
					sourceRoot: "app",
				}),
			]),
		);
		expect(profile.layoutEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					routePath: "/dashboard",
					filePath: "app/dashboard/layout.tsx",
				}),
			]),
		);
		expect(profile.componentEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: "components/shared/hero.tsx",
					category: "shared",
				}),
			]),
		);
		expect(profile.tokenHints.cssVariableFiles).toContain("app/globals.css");
		expect(profile.patternHints.clientComponentFiles).toContain(
			"components/shared/hero.tsx",
		);
		expect(profile.styleStack).toMatchObject({
			usesComponentsJson: true,
			usesCssVariables: true,
			tokenAuthority: "css-variables",
		});
		expect(profile.evidenceAnchors?.length).toBeGreaterThan(0);
		expect(profile.confidence?.overall).toBe("medium");
		expect(profile.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "layout-shell",
				}),
			]),
		);
	});

	it("detects mixed routing, route groups, parallel routes, and heuristic hotspots", async () => {
		const workspaceRoot = await mkTempDir("openui-workspace-profile-mixed-");
		await fs.mkdir(path.join(workspaceRoot, "app", "(marketing)", "@modal"), {
			recursive: true,
		});
		await fs.mkdir(path.join(workspaceRoot, "pages", "docs"), {
			recursive: true,
		});
		await fs.mkdir(path.join(workspaceRoot, "components", "generated"), {
			recursive: true,
		});
		await fs.mkdir(path.join(workspaceRoot, "components", "navigation"), {
			recursive: true,
		});

		await fs.writeFile(
			path.join(workspaceRoot, "app", "(marketing)", "layout.tsx"),
			"export default function Layout({children}:{children: React.ReactNode}){return <section>{children}</section>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "app", "(marketing)", "@modal", "page.tsx"),
			"export default function Page(){return <main>Modal</main>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "pages", "docs", "index.tsx"),
			"export default function Docs(){return <main>Docs</main>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "components", "generated", "chart.tsx"),
			"'use client'\nexport function GeneratedChart(){return <div />}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "components", "navigation", "sidebar.tsx"),
			"'use client'\nexport function Sidebar(){return <nav />}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "dashboard-table.tsx"),
			"'use client'\nexport function DashboardTable(){return <table><tbody /></table>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "sales-chart.tsx"),
			"'use client'\nexport function SalesChart(){return <LineChart />}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "settings-form.tsx"),
			"'use client'\nimport { useForm } from \"react-hook-form\";\nexport function SettingsForm(){useForm(); return <form />}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "server-action.ts"),
			"'use server'\nexport async function save(){return true;}\n",
		);

		const profile = await scanWorkspaceProfile({
			workspaceRoot,
			targetRoot: ".",
		});

		expect(profile.routingMode).toBe("mixed");
		expect(profile.routeGroups).toContain("marketing");
		expect(profile.parallelRouteKeys).toContain("modal");
		expect(profile.styleStack.tokenAuthority).toBe("unknown");
		expect(profile.unknowns).toEqual(
			expect.arrayContaining([
				expect.stringContaining("No obvious CSS variable"),
				expect.stringContaining("Both app-router and pages-router"),
			]),
		);
		expect(profile.componentEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: "components/generated/chart.tsx",
					category: "generated",
				}),
				expect.objectContaining({
					filePath: "components/navigation/sidebar.tsx",
					category: "shared",
				}),
			]),
		);
		expect(profile.patternHints.formLibraries).toEqual(
			expect.arrayContaining(["custom-useForm", "react-hook-form"]),
		);
		expect(profile.patternHints.serverActionFiles).toContain(
			"server-action.ts",
		);
		expect(profile.patternHints.tableFiles).toContain("dashboard-table.tsx");
		expect(profile.patternHints.chartFiles).toContain("sales-chart.tsx");
		expect(profile.patternHints.navigationFiles).toEqual(
			expect.arrayContaining(["components/navigation/sidebar.tsx"]),
		);
		expect(profile.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "route-group", label: "marketing" }),
				expect.objectContaining({ kind: "parallel-route", label: "modal" }),
				expect.objectContaining({ kind: "table-surface" }),
				expect.objectContaining({ kind: "chart-surface" }),
				expect.objectContaining({ kind: "navigation-surface" }),
				expect.objectContaining({ kind: "token-authority" }),
			]),
		);
		expect(profile.confidence?.overall).toBe("medium");
	});

	it("handles nested pages roots, missing scan roots, and low-signal workspaces", async () => {
		const workspaceRoot = await mkTempDir(
			"openui-workspace-profile-low-signal-",
		);
		await fs.mkdir(path.join(workspaceRoot, "src", "pages", "blog"), {
			recursive: true,
		});

		await fs.writeFile(
			path.join(workspaceRoot, "src", "pages", "index.tsx"),
			"export default function Home(){return <main>Home</main>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "src", "pages", "blog", "index.tsx"),
			"export default function Blog(){return <main>Blog</main>}\n",
		);

		const nestedPagesProfile = await scanWorkspaceProfile({
			workspaceRoot,
			targetRoot: ".",
		});

		expect(nestedPagesProfile.routingMode).toBe("pages-router");
		expect(nestedPagesProfile.routeEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: "src/pages/index.tsx",
					routePath: "/",
					sourceRoot: "pages",
				}),
				expect.objectContaining({
					filePath: "src/pages/blog/index.tsx",
					routePath: "/blog",
					sourceRoot: "pages",
				}),
			]),
		);

		const missingRootProfile = await scanWorkspaceProfile({
			workspaceRoot,
			targetRoot: "missing-target",
		});

		expect(missingRootProfile.routeEntries).toEqual([]);
		expect(missingRootProfile.routingMode).toBe("unknown");
		expect(missingRootProfile.unknowns).toEqual(
			expect.arrayContaining([
				expect.stringContaining("No route files"),
				expect.stringContaining("No component inventory"),
				expect.stringContaining("No obvious CSS variable"),
			]),
		);
		expect(missingRootProfile.confidence?.overall).toBe("low");
	});

	it("detects app-router route kind variants and ignores pages api internals", async () => {
		const workspaceRoot = await mkTempDir(
			"openui-workspace-profile-route-kinds-",
		);
		await fs.mkdir(path.join(workspaceRoot, "app", "dashboard"), {
			recursive: true,
		});
		await fs.mkdir(path.join(workspaceRoot, "pages", "api"), {
			recursive: true,
		});

		await fs.writeFile(
			path.join(workspaceRoot, "app", "route.ts"),
			"export function GET(){return Response.json({ok:true});}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "app", "loading.tsx"),
			"export default function Loading(){return <div>Loading</div>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "app", "error.tsx"),
			"export default function ErrorBoundary(){return <div>Error</div>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "app", "dashboard", "page.tsx"),
			"export default function Dashboard(){return <main>Dashboard</main>}\n",
		);
		await fs.writeFile(
			path.join(workspaceRoot, "pages", "api", "health.ts"),
			"export default function handler(){return null}\n",
		);

		const profile = await scanWorkspaceProfile({
			workspaceRoot,
			targetRoot: ".",
		});

		expect(profile.routingMode).toBe("app-router");
		expect(profile.routeEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: "app/route.ts",
					kind: "route",
				}),
				expect.objectContaining({
					filePath: "app/loading.tsx",
					kind: "loading",
				}),
				expect.objectContaining({
					filePath: "app/error.tsx",
					kind: "error",
				}),
				expect.objectContaining({
					filePath: "app/dashboard/page.tsx",
					kind: "page",
					routePath: "/dashboard",
				}),
			]),
		);
		expect(
			profile.routeEntries.some((entry) =>
				entry.filePath.includes("pages/api"),
			),
		).toBe(false);
	});

	it("auto-detects apps/web and captures form/navigation hotspots for grouped dynamic routes", async () => {
		const workspaceRoot = await mkTempDir("openui-workspace-profile-apps-web-");
		const appRoot = path.join(workspaceRoot, "apps", "web");
		await fs.mkdir(
			path.join(appRoot, "app", "(admin)", "@drawer", "customers", "[id]"),
			{
				recursive: true,
			},
		);
		await fs.mkdir(path.join(appRoot, "components", "forms"), {
			recursive: true,
		});
		await fs.mkdir(path.join(appRoot, "components", "navigation"), {
			recursive: true,
		});

		await fs.writeFile(
			path.join(
				appRoot,
				"app",
				"(admin)",
				"@drawer",
				"customers",
				"[id]",
				"page.tsx",
			),
			"export default function CustomerPage(){return <main>Customer</main>}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "components", "forms", "customer-form.tsx"),
			'\'use client\'\nimport { useForm } from "react-hook-form";\nexport function CustomerForm(){useForm(); return <form><input name="email" /></form>}\n',
		);
		await fs.writeFile(
			path.join(appRoot, "components", "navigation", "sidebar.tsx"),
			"'use client'\nexport function Sidebar(){return <nav />}\n",
		);
		await fs.writeFile(
			path.join(appRoot, "tailwind.config.ts"),
			"export default { theme: { extend: {} } };\n",
		);

		const profile = await scanWorkspaceProfile({
			workspaceRoot,
		});

		expect(profile.defaultTargetRoot).toBe("apps/web");
		expect(profile.routingMode).toBe("app-router");
		expect(profile.routeEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: "app/(admin)/@drawer/customers/[id]/page.tsx",
					routeGroupSegments: ["admin"],
					parallelRouteKeys: ["drawer"],
					dynamicSegments: ["[id]"],
				}),
			]),
		);
		expect(profile.styleStack).toMatchObject({
			usesTailwindConfig: true,
			usesCssVariables: false,
			tokenAuthority: "tailwind-only",
		});
		expect(profile.patternHints.formFiles).toEqual(
			expect.arrayContaining(["components/forms/customer-form.tsx"]),
		);
		expect(profile.patternHints.navigationFiles).toEqual(
			expect.arrayContaining(["components/navigation/sidebar.tsx"]),
		);
		expect(profile.evidenceAnchors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					area: "patterns",
					label: "navigation-surface",
					filePath: "components/navigation/sidebar.tsx",
				}),
			]),
		);
		expect(profile.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "route-group",
					label: "admin",
				}),
				expect.objectContaining({
					kind: "parallel-route",
					label: "drawer",
				}),
				expect.objectContaining({
					kind: "form-surface",
					filePath: "components/forms/customer-form.tsx",
				}),
				expect.objectContaining({
					kind: "navigation-surface",
					filePath: "components/navigation/sidebar.tsx",
				}),
			]),
		);
		expect(profile.unknowns).toEqual(
			expect.arrayContaining([
				expect.stringContaining("No obvious CSS variable"),
			]),
		);
	});
});
