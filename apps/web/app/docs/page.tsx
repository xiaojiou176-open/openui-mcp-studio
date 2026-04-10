import Link from "next/link";

import { FrontdoorShell } from "@/components/frontdoor-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DOCS_DECISION_TABLE,
	DISCOVERY_CHAIN,
	ECOSYSTEM_PRODUCTIZATION_STATUS,
	OPERATOR_ONLY_PUBLIC_SURFACES,
	PUBLIC_BUNDLE,
	SITE_BRAND,
} from "@/lib/frontdoor-content";
import { buildStructuredDiscoveryJsonLd, serializeJsonLd } from "@/lib/seo";
import { buildPageMetadata, getResolvedSiteUrl } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
	title: "Discovery docs hub",
	description:
		"One readable route through the README storefront, proof FAQ, evaluator checklist, release shelf, and ecosystem ledgers for OpenUI MCP Studio.",
	path: "/docs",
	keywords: [
		"OpenUI MCP Studio docs",
		"discovery route",
		"proof FAQ",
		"evaluator checklist",
		"ecosystem productization",
	],
});

const docsStructuredData = buildStructuredDiscoveryJsonLd({
	siteUrl: getResolvedSiteUrl(),
	path: "/docs",
	title: "Discovery docs hub",
	description:
		"One readable route through the README storefront, proof FAQ, evaluator checklist, release shelf, and ecosystem ledgers for OpenUI MCP Studio.",
	type: "CollectionPage",
	breadcrumbLabel: "Docs",
	about: [
		"README storefront",
		"proof desk",
		"evaluator checklist",
		"ecosystem ledgers",
	],
});

const DOC_SHELVES = [
	{
		id: "first-minute-walkthrough",
		title: "First-minute walkthrough",
		body:
			"Use this when you want the shortest guided route from front door to proof, workbench, and one real command before you branch into longer docs.",
		link: "/walkthrough",
		cta: "Open walkthrough route",
	},
	{
		id: "proof-faq",
		title: "Proof FAQ",
		body:
			"Use the proof desk when you need the meaning of proof, review, acceptance, and the boundaries between repo-owned evidence and human judgment.",
		link: "/proof",
		cta: "Open proof desk",
	},
	{
		id: "docs-index",
		title: "README storefront",
		body:
			"Open the README after the route is already clear and you want the GitHub-facing storefront wording in its canonical home.",
		link: SITE_BRAND.docs.readme,
		cta: "Open README storefront",
		external: true,
	},
	{
		id: "evaluator-checklist",
		title: "Evaluator checklist",
		body:
			"Use this when you want the shortest decision sheet instead of the full narrative.",
		link: SITE_BRAND.docs.evaluatorChecklist,
		cta: "Jump to evaluator checklist notes",
	},
	{
		id: "public-surface",
		title: "Public surface guide",
		body:
			"Use this when the question becomes how README, routes, release assets, and GitHub storefront should keep telling one story.",
		link: SITE_BRAND.docs.publicSurfaceGuide,
		cta: "Jump to public surface notes",
	},
	{
		id: "release-proof-shelf",
		title: "Release proof shelf",
		body:
			"Use this when you need the public bundle and release shelf explained in one place.",
		link: SITE_BRAND.docs.releaseTemplate,
		cta: "Jump to release proof shelf notes",
	},
	{
		id: "external-activation-ledger",
		title: "External activation ledger",
		body:
			"Use this when you want the storefront and GitHub control split written down as one ledger.",
		link: SITE_BRAND.docs.externalActivationLedger,
		cta: "Jump to external activation ledger",
	},
	{
		id: "ecosystem-ledger",
		title: "Ecosystem ledger",
		body:
			"Use this when you want the current Codex / Claude bundle, OpenClaw public-ready bundle, Skills starter, and supporting SDK / hosted lanes in one bounded view.",
		link: SITE_BRAND.docs.ecosystemLedger,
		cta: "Jump to ecosystem ledger",
	},
		{
			id: "public-skills-ledger",
			title: "Public Skills / plugin-like ledger",
			body:
				"Use this when you want the repo-owned starter-pack packaging and plugin-like install surface split written down clearly.",
			link: SITE_BRAND.docs.publicSkillsLedger,
			cta: "Jump to public Skills ledger",
		},
	{
		id: "sdk-hosted-ledger",
		title: "SDK / hosted API ledger",
		body:
			"Use this when you want the supporting / parked SDK package, hosted runtime, proof path, and operator-only tail in one place.",
		link: SITE_BRAND.docs.sdkHostedLedger,
		cta: "Jump to SDK / hosted API ledger",
	},
	{
		id: "public-distribution-bundle",
		title: "Public distribution bundle",
		body:
			"Use this when you want the package-ready Codex / Claude bundle, the OpenClaw public-ready bundle, and the repo-owned install/proof/troubleshooting artifacts in one place.",
		link: SITE_BRAND.docs.publicDistributionBundle,
		cta: "Open public distribution bundle",
		external: true,
	},
];

export default function DocsDiscoveryPage() {
	return (
		<FrontdoorShell activeHref="/docs">
			<main
				id="main-content"
				className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8"
			>
				<section className="rounded-[var(--radius-xl)] border border-border/70 bg-frontdoor-hero px-6 py-8 shadow-xl sm:px-8">
					<div className="space-y-4">
							<Badge className="bg-primary/95 text-primary-foreground">
								Docs discovery route
							</Badge>
							<h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
								Keep the docs inside a guided route, not a blob dump.
							</h1>
							<p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
								This route exists so visitors can learn the product in the same
								order a reviewer would: guided path first, proof second, operator
								desk third, and the longer shelves only after the first-screen
								story is clear.
							</p>
							<div className="flex flex-wrap gap-3">
								<Button asChild size="lg">
									<Link href="/walkthrough">Open the walkthrough</Link>
								</Button>
								<Button asChild size="lg" variant="outline">
									<Link href="/proof">Open the proof desk</Link>
								</Button>
								<Button asChild size="lg" variant="ghost">
									<Link href="/workbench">Open the operator desk</Link>
								</Button>
							</div>
						</div>
				</section>

				<section className="space-y-4" id="discovery-chain">
					<div className="space-y-2">
						<Badge variant="outline" className="w-fit border-primary/20 bg-primary/5">
							Discovery chain
						</Badge>
						<h2 className="text-2xl font-semibold tracking-tight">
							Read the product in this order.
						</h2>
						<p className="max-w-3xl text-sm leading-7 text-muted-foreground">
							The goal is simple: guided route first, proof second, operator
							context third, then the longer shelves and machine-readable
							surfaces. That keeps discovery from feeling like a source-code
							scavenger hunt.
						</p>
					</div>
					<div className="grid gap-4 lg:grid-cols-3">
						{DISCOVERY_CHAIN.map((item) => (
							<Card key={item.step} className="border-border/70 bg-card/90">
								<CardHeader>
									<Badge
										variant="outline"
										className="w-fit border-primary/20 bg-primary/5"
									>
										{item.step}
									</Badge>
									<CardTitle className="text-xl tracking-tight">
										{item.title}
									</CardTitle>
									<CardDescription>{item.body}</CardDescription>
								</CardHeader>
								<CardContent className="pt-0">
									<Button asChild variant="outline" className="w-full justify-start">
										<Link href={item.href}>{item.role}</Link>
									</Button>
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				<section className="space-y-4" aria-labelledby="decision-table-title">
					<div className="space-y-2">
						<Badge variant="outline" className="w-fit border-primary/20 bg-primary/5">
							Question router
						</Badge>
						<h2 id="decision-table-title" className="text-2xl font-semibold tracking-tight">
							Ask one reviewer question first, then open one shelf.
						</h2>
						<p className="max-w-3xl text-sm leading-7 text-muted-foreground">
							This second-cut docs hub acts more like a concierge desk than a file
							cabinet. Start from the question you are holding, then jump to the
							one route that best answers it.
						</p>
					</div>
					<div className="grid gap-4 lg:grid-cols-3">
						{DOCS_DECISION_TABLE.map((item) => (
							<Card key={item.question} className="border-border/70 bg-card/90">
								<CardHeader className="space-y-3">
									<Badge
										variant="outline"
										className="w-fit border-primary/20 bg-primary/5"
									>
										{item.firstStop}
									</Badge>
									<CardTitle className="text-xl tracking-tight">
										{item.question}
									</CardTitle>
									<CardDescription>{item.useWhen}</CardDescription>
								</CardHeader>
								<CardContent className="pt-0">
									<Button asChild variant="outline" className="w-full justify-start">
										<Link href={item.href}>Open this route first</Link>
									</Button>
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				<section className="space-y-4">
					<div id="docs-shelves" />
					<div className="space-y-2">
						<Badge variant="outline" className="w-fit border-primary/20 bg-primary/5">
							Docs shelves
						</Badge>
						<h2 className="text-2xl font-semibold tracking-tight">
							The human-readable shelves
						</h2>
					</div>
					<div className="grid gap-4 lg:grid-cols-2">
						{DOC_SHELVES.map((item) => (
							<Card key={item.id} id={item.id} className="border-border/70 bg-card/90">
								<CardHeader>
									<CardTitle className="text-xl tracking-tight">{item.title}</CardTitle>
									<CardDescription>{item.body}</CardDescription>
								</CardHeader>
								<CardContent className="pt-0">
									<Button asChild variant="outline" className="w-full justify-start">
										<Link
											href={item.link}
											target={item.external ? "_blank" : undefined}
											rel={item.external ? "noreferrer" : undefined}
										>
											{item.cta}
										</Link>
									</Button>
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				<section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
					<Card className="border-border/70 bg-card/90">
						<CardHeader>
							<Badge variant="outline" className="w-fit border-primary/20 bg-primary/5">
								Public bundle
							</Badge>
							<CardTitle className="text-2xl tracking-tight">
								What belongs on the public shelf
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
							{PUBLIC_BUNDLE.map((bundle) => (
								<div
									key={bundle.title}
									className="rounded-xl border border-border/70 bg-background/80 p-4"
								>
									<p className="font-medium text-foreground">{bundle.title}</p>
									<ul className="mt-2 space-y-1">
										{bundle.items.map((item) => (
											<li key={item}>- {item}</li>
										))}
									</ul>
								</div>
							))}
						</CardContent>
					</Card>

					<Card className="border-border/70 bg-card/90">
						<CardHeader>
							<Badge variant="outline" className="w-fit border-primary/20 bg-primary/5">
								Operator tail
							</Badge>
							<CardTitle className="text-2xl tracking-tight">
								What still stays settings-level
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
							{OPERATOR_ONLY_PUBLIC_SURFACES.map((surface) => (
								<div
									key={surface.title}
									className="rounded-xl border border-border/70 bg-background/80 p-4"
								>
									<p className="font-medium text-foreground">{surface.title}</p>
									<p className="mt-2">{surface.body}</p>
								</div>
							))}
						</CardContent>
					</Card>
				</section>

				<section className="space-y-4">
					<div className="space-y-2">
						<Badge variant="outline" className="w-fit border-primary/20 bg-primary/5">
							Ecosystem lanes
						</Badge>
						<h2 className="text-2xl font-semibold tracking-tight">
							Current versus bounded ecosystem surfaces
						</h2>
					</div>
					<div className="grid gap-4 lg:grid-cols-2">
						{ECOSYSTEM_PRODUCTIZATION_STATUS.map((surface) => (
							<Card key={surface.id} className="border-border/70 bg-card/90">
								<CardHeader>
									<div className="flex flex-wrap items-center gap-2">
										<Badge
											variant="outline"
											className="w-fit border-primary/20 bg-primary/5"
										>
											{surface.status}
										</Badge>
										<CardTitle className="text-xl tracking-tight">
											{surface.title}
										</CardTitle>
									</div>
										<CardDescription>{surface.body}</CardDescription>
								</CardHeader>
								<CardContent className="space-y-2 text-sm leading-7 text-muted-foreground">
									<p>
										<span className="font-semibold text-foreground">Audience:</span>{" "}
										{surface.audience}
									</p>
									<p>
										<span className="font-semibold text-foreground">Best for:</span>{" "}
										{surface.bestFor}
									</p>
									<p>
										<span className="font-semibold text-foreground">Read when:</span>{" "}
										{surface.readWhen}
									</p>
									<p>
										<span className="font-semibold text-foreground">Not for:</span>{" "}
										{surface.notFor}
									</p>
								</CardContent>
							</Card>
						))}
					</div>
				</section>
				{docsStructuredData ? (
					<script type="application/ld+json" aria-hidden="true">
						{serializeJsonLd(docsStructuredData)}
					</script>
				) : null}
			</main>
		</FrontdoorShell>
	);
}
