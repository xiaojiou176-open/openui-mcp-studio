import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerUiuxReviewTool } from "../services/mcp-server/src/tools/uiux-review.js";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

function createToolHarness(): {
	server: McpServer;
	getHandler: (name: string) => ToolHandler;
} {
	const handlers = new Map<string, ToolHandler>();
	const server = {
		registerTool(name: string, _config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid tool handler for ${name}`);
			}
			handlers.set(name, handler as ToolHandler);
		},
	} as unknown as McpServer;

	return {
		server,
		getHandler(name: string) {
			const handler = handlers.get(name);
			if (!handler) {
				throw new Error(`Missing tool handler: ${name}`);
			}
			return handler;
		},
	};
}

function readText(result: TextResult): string {
	const block = result.content.find((item) => item.type === "text");
	if (!block?.text) {
		throw new Error("Tool result is missing text content.");
	}
	return block.text;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("uiux review tool", () => {
	it("returns structured heuristic review", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: "<div><img src='a.png' /></div>",
			threshold: 70,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				score: number;
				passed: boolean;
				issues: Array<{ id: string }>;
			};
		};

		expect(payload.review.score).toBeLessThan(100);
		expect(payload.review.passed).toBe(false);
		expect(payload.review.issues.length).toBeGreaterThan(0);
	});

	it("flags tab semantics and keyboard focus heuristics", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Demo</h1>
					<div role="tablist">
						<button role="tab">Overview</button>
					</div>
					<div role="tabpanel">Panel</div>
				</main>
			`,
			threshold: 90,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				passed: boolean;
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(payload.review.passed).toBe(false);
		expect(issueIds).toContain("tab-aria-controls-missing");
		expect(issueIds).toContain("tab-aria-selected-missing");
		expect(issueIds).toContain("tabpanel-aria-labelledby-missing");
		expect(issueIds).toContain("focus-visible-style-missing");
	});

	it("flags multiple h1 headings and anchor without href", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Primary</h1>
					<h1>Secondary</h1>
					<a class="cta">Open panel</a>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("multiple-h1");
		expect(issueIds).toContain("link-href-missing");
	});

	it("flags unlabeled input, icon-only button and positive tabindex", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Profile</h1>
					<input id="email" type="email" />
					<button type="button"><svg aria-hidden="true"></svg></button>
					<button type="button" tabindex="2">Secondary action</button>
				</main>
			`,
			threshold: 95,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				passed: boolean;
				issues: Array<{ id: string }>;
			};
		};

		const issueIds = payload.review.issues.map((item) => item.id);
		expect(payload.review.passed).toBe(false);
		expect(issueIds).toContain("form-label-missing");
		expect(issueIds).toContain("button-accessible-name-missing");
		expect(issueIds).toContain("positive-tabindex");
	});

	it("detects unlabeled textarea/select and does not treat title as accessible name", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Settings</h1>
					<textarea></textarea>
					<select><option>Alpha</option></select>
					<button type="button" title="Icon action"><svg></svg></button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("form-label-missing");
		expect(issueIds).toContain("button-accessible-name-missing");
	});

	it("flags unlabeled control when duplicated markup appears after wrapped labeled control", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Profile</h1>
					<label>Name<input type="text" /></label>
					<input type="text" />
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("form-label-missing");
	});

	it("does not flag button accessible-name issue when sr-only text is present", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Toolbar</h1>
					<button type="button">
						<svg aria-hidden="true"></svg>
						<span class="sr-only">Open settings</span>
					</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("button-accessible-name-missing");
	});

	it("accepts wrapped label semantics for form controls", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Profile</h1>
					<label>Email<input type="email" /></label>
					<label for="bio">Bio</label>
					<textarea id="bio"></textarea>
					<label for="plan">Plan</label>
					<select id="plan"><option>Pro</option></select>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("form-label-missing");
	});

	it("accepts hidden and aria-labeled controls as labeled", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Profile</h1>
					<input type="hidden" value="meta" />
					<input type="email" aria-label="Email address" />
					<p id="bio-label">Biography</p>
					<textarea aria-labelledby="bio-label"></textarea>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("form-label-missing");
	});

	it("respects threshold gate for heuristic score", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: "<main><h1>Page</h1><button>Action</button></main>",
			threshold: 95,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: { score: number; threshold: number; passed: boolean };
		};
		expect(payload.review.score).toBeLessThan(95);
		expect(payload.review.threshold).toBe(95);
		expect(payload.review.passed).toBe(false);
	});

	it("flags insufficient touch target size when explicit dimensions are too small", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Actions</h1>
					<button type="button" style="width:20px;height:20px" class="focus:ring-2">A</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("touch-target-size-insufficient");
	});

	it("does not flag touch target when explicit padding compensation is present", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Actions</h1>
					<button type="button" class="w-4 h-4 p-2 focus:ring-2">A</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("touch-target-size-insufficient");
	});

	it("flags touch target when padding token exists but does not compensate size", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Actions</h1>
					<button type="button" class="w-4 h-4 p-0 focus:ring-2">A</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("touch-target-size-insufficient");
	});

	it("flags comfort gap when touch target is above WCAG minimum but below 44x44 guidance", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Actions</h1>
					<button type="button" style="width:30px;height:30px" class="focus:ring-2">A</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("touch-target-size-insufficient");
		expect(issueIds).toContain("touch-target-comfort-gap");
	});

	it("flags focus indicator suppression when outline is removed without replacement", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Actions</h1>
					<button type="button" class="outline-none">Action</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("focus-indicator-suppressed");
	});

	it("does not flag focus suppression when outline removal includes focus replacement", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Actions</h1>
					<button type="button" class="outline-none focus-visible:ring-2">Action</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("focus-indicator-suppressed");
	});

	it("flags focus suppression when focus:outline-none is the only focus class", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Actions</h1>
					<button type="button" class="outline-none focus:outline-none">Action</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("focus-indicator-suppressed");
	});

	it("flags insufficient text contrast when foreground and background are statically inferable", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Contrast</h1>
					<p style="color:#777777;background-color:#8a8a8a">Low contrast copy</p>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("text-contrast-insufficient-static");
	});

	it("exempts text contrast check when colors are not statically inferable", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Contrast</h1>
					<p style="color:var(--text-muted);background-color:#ffffff">Tokenized text</p>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("text-contrast-insufficient-static");
	});

	it("flags translucent rgba contrast pair conservatively", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Contrast</h1>
					<p style="color:rgba(120,120,120,0.6);background-color:#ffffff">Alpha text</p>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("text-contrast-insufficient-static");
	});

	it("flags insufficient non-text contrast when border and background are statically inferable", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Controls</h1>
					<button type="button" style="background-color:#ffffff;border:1px solid #f2f2f2" class="focus:ring-2">Action</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("non-text-contrast-insufficient-static");
	});

	it("exempts non-text contrast check when static border/background pair is incomplete", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Controls</h1>
					<button type="button" style="border:1px solid #f2f2f2" class="focus:ring-2">Action</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("non-text-contrast-insufficient-static");
	});

	it("flags potential focus obscured risk for sticky top + in-page anchors without offset mitigation", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<header class="sticky top-0">Top nav</header>
				<main>
					<h1 id="overview">Overview</h1>
					<a href="#details" class="focus:ring-2">Jump to details</a>
					<section id="details">
						<button type="button" class="focus:ring-2">Details action</button>
					</section>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("focus-not-obscured-risk");
	});

	it("does not flag focus obscured risk when scroll offset mitigation is present", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<header class="sticky top-0">Top nav</header>
				<main>
					<h1 id="overview">Overview</h1>
					<a href="#details" class="focus:ring-2">Jump to details</a>
					<section id="details" class="scroll-mt-24">
						<button type="button" class="focus:ring-2">Details action</button>
					</section>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("focus-not-obscured-risk");
	});

	it("flags missing skip link when navigation exists without bypass mechanism", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<nav>
					<a href="/home">Home</a>
					<a href="/docs">Docs</a>
				</nav>
				<main id="main-content">
					<h1>Docs</h1>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("bypass-blocks-skip-link-missing");
	});

	it("flags missing skip link when many pre-main links exist without nav landmark", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<header>
					<a href="/home">Home</a>
					<a href="/docs">Docs</a>
					<a href="/pricing">Pricing</a>
					<a href="/about">About</a>
				</header>
				<main id="main-content">
					<h1>Docs</h1>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("bypass-blocks-skip-link-missing");
	});

	it("does not treat skip-link text without href as valid bypass mechanism", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<a class="sr-only focus:not-sr-only">Skip to main content</a>
				<nav>
					<a href="/home">Home</a>
				</nav>
				<main id="main-content">
					<h1>Docs</h1>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("bypass-blocks-skip-link-missing");
	});

	it("does not flag skip-link issue when bypass link is present", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<a href="#main-content" class="sr-only focus:not-sr-only">Skip to main content</a>
				<nav>
					<a href="/home">Home</a>
					<a href="/docs">Docs</a>
				</nav>
				<main id="main-content">
					<h1>Docs</h1>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("bypass-blocks-skip-link-missing");
	});

	it("flags dialog keyboard and focus risks when dialog clues are missing", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Demo</h1>
					<button type="button" class="focus:ring-2">Open dialog</button>
					<div role="dialog" aria-labelledby="dialog-title">
						<h2 id="dialog-title">Confirm delete</h2>
						<p>This action cannot be undone.</p>
						<button type="button">Delete</button>
					</div>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("dialog-esc-close-missing");
		expect(issueIds).not.toContain("dialog-initial-focus-clue-missing");
		expect(issueIds).toContain("dialog-focus-trap-risk");
	});

	it("flags missing dialog initial-focus clue when no focusable target exists", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Demo</h1>
					<div role="dialog" aria-labelledby="dialog-title">
						<h2 id="dialog-title">Notice</h2>
						<p>System maintenance starts at midnight.</p>
					</div>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("dialog-initial-focus-clue-missing");
	});

	it("does not flag dialog keyboard and focus heuristics when accessibility clues are present", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main inert>
					<h1>Demo</h1>
					<button type="button" class="focus:ring-2">Background action</button>
				</main>
				<div
					role="dialog"
					aria-modal="true"
					tabindex="-1"
					onEscapeKeyDown="closeDialog"
					aria-labelledby="dialog-title"
				>
					<h2 id="dialog-title">Confirm</h2>
					<button type="button" autofocus>Confirm</button>
					<button type="button">Cancel</button>
				</div>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("dialog-esc-close-missing");
		expect(issueIds).not.toContain("dialog-initial-focus-clue-missing");
		expect(issueIds).not.toContain("dialog-focus-trap-risk");
	});

	it("treats native dialog as Escape-capable without requiring custom esc hook", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Native dialog demo</h1>
				</main>
				<dialog open>
					<form method="dialog">
						<p>Dialog content</p>
						<button type="submit">Close</button>
					</form>
				</dialog>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("dialog-esc-close-missing");
	});

	it("flags primary-action overload when multiple primary controls are present", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Checkout</h1>
					<button type="button" class="btn-primary">Pay now</button>
					<button type="button" class="ant-btn ant-btn-primary">Save card</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("primary-action-overload");
	});

	it("flags primary-action overload when semantic variant props mark multiple primary actions", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Checkout</h1>
					<button type="button" variant="primary">Pay now</button>
					<button type="button" data-variant="primary">Save card</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("primary-action-overload");
	});

	it("does not flag primary-action overload when only one primary control is present", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Checkout</h1>
					<button type="button" class="btn-primary">Pay now</button>
					<button type="button" class="btn-secondary">Save draft</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("primary-action-overload");
	});

	it("does not treat utility color classes as primary-action markers", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Docs</h1>
					<a href="/getting-started" class="text-primary underline">Get started</a>
					<button type="button" class="text-primary border">Secondary action</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("primary-action-overload");
	});

	it("flags hardcoded color literals that bypass design tokens", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Theme</h1>
					<p style="color:#555;background-color:#ffffff">Hardcoded colors</p>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("token-color-hardcoded");
	});

	it("flags spacing values outside approved scale", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Spacing</h1>
					<div style="margin-top:13px;padding:8px">Card</div>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("spacing-scale-inconsistent");
	});

	it("flags non-scale tailwind spacing tokens from class utilities", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Spacing</h1>
					<div class="mt-5 p-2">Card</div>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("spacing-scale-inconsistent");
	});

	it("does not flag approved tailwind spacing token classes", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Spacing</h1>
					<div class="mt-3 p-2">Card</div>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("spacing-scale-inconsistent");
	});

	it("does not flag spacing scale issue for approved spacing values", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Spacing</h1>
					<div style="margin-top:12px;padding:8px">Card</div>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("spacing-scale-inconsistent");
	});

	it("returns backward-compatible issue metadata fields", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: "<div><img src='a.png' /></div>",
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{
					confidence: "low" | "medium" | "high";
					priority: "p1" | "p2" | "p3" | "p4";
					principle: string;
					taskFlowImpact: boolean;
					evidence: string;
				}>;
			};
		};

		expect(payload.review.issues.length).toBeGreaterThan(0);
		for (const issue of payload.review.issues) {
			expect(["low", "medium", "high"]).toContain(issue.confidence);
			expect(["p1", "p2", "p3", "p4"]).toContain(issue.priority);
			expect(issue.principle.length).toBeGreaterThan(0);
			expect(typeof issue.taskFlowImpact).toBe("boolean");
			expect(issue.evidence.length).toBeGreaterThan(0);
		}
	});

	it("applies task-flow weight when taskFlowCritical=true", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);
		const html = `
			<main>
				<h1>Checkout</h1>
				<button type="button" class="btn-primary">Pay now</button>
				<button type="button" class="ant-btn ant-btn-primary">Save card</button>
			</main>
		`;

		const normalResult = await harness.getHandler("openui_review_uiux")({
			html,
			invokeModel: false,
			taskFlowCritical: false,
		});
		const criticalResult = await harness.getHandler("openui_review_uiux")({
			html,
			invokeModel: false,
			taskFlowCritical: true,
		});

		const normalPayload = JSON.parse(readText(normalResult)) as {
			review: { score: number };
		};
		const criticalPayload = JSON.parse(readText(criticalResult)) as {
			review: { score: number };
		};

		expect(criticalPayload.review.score).toBeLessThan(
			normalPayload.review.score,
		);
	});

	it("requests model critique when invokeModel=true", async () => {
		const openuiClient = await import("../services/mcp-server/src/openui-client.js");
		const chatSpy = vi
			.spyOn(openuiClient, "openuiChatComplete")
			.mockResolvedValue(
				"Top 3 improvements: add main, improve spacing, add labels.",
			);

		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: "<main><h1>Checkout</h1></main>",
			threshold: 75,
			invokeModel: true,
			model: "gemini-3.1-pro-preview",
		});

		const payload = JSON.parse(readText(result)) as {
			status: string;
			review: { score: number; passed: boolean };
			modelCritique?: string;
		};

		expect(chatSpy).toHaveBeenCalledTimes(1);
		expect(chatSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("<main><h1>Checkout</h1></main>"),
			}),
		);
		expect(payload.status).toBe("ok");
		expect(payload.review.score).toBeGreaterThanOrEqual(0);
		expect(payload.review.score).toBeLessThanOrEqual(100);
		expect(typeof payload.review.passed).toBe("boolean");
		expect(payload.modelCritique).toContain("Top 3 improvements");
	});

	it("flags missing UI state coverage heuristics for data-driven view", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Orders</h1>
					<button type="button">Refresh</button>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).toContain("state-loading-missing");
		expect(issueIds).toContain("state-error-missing");
		expect(issueIds).toContain("state-empty-missing");
		expect(issueIds).toContain("state-disabled-missing");
		expect(issueIds).toContain("state-success-missing");
	});

	it("does not flag missing state coverage when loading/error/empty/disabled/success clues exist", async () => {
		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: `
				<main>
					<h1>Orders</h1>
					<div aria-busy="true">Loading orders...</div>
					<div role="alert">Something went wrong.</div>
					<section data-state="empty">No data yet</section>
					<button type="button" disabled>Submit</button>
					<div data-state="success">Saved successfully</div>
				</main>
			`,
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string }>;
			};
		};
		const issueIds = payload.review.issues.map((item) => item.id);
		expect(issueIds).not.toContain("state-loading-missing");
		expect(issueIds).not.toContain("state-error-missing");
		expect(issueIds).not.toContain("state-empty-missing");
		expect(issueIds).not.toContain("state-disabled-missing");
		expect(issueIds).not.toContain("state-success-missing");
	});

	it("passes screenshot input as multimodal part when invokeModel=true", async () => {
		const openuiClient = await import("../services/mcp-server/src/openui-client.js");
		const chatSpy = vi
			.spyOn(openuiClient, "openuiChatComplete")
			.mockResolvedValue("Looks good.");

		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		await harness.getHandler("openui_review_uiux")({
			html: "<main><h1>Dashboard</h1></main>",
			invokeModel: true,
			screenshotBase64: "ZmFrZS1pbWFnZS1ieXRlcw==",
			screenshotMimeType: "image/png",
		});

		expect(chatSpy).toHaveBeenCalledTimes(1);
		expect(chatSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				routeKey: "strong",
				inputParts: [
					expect.objectContaining({
						type: "image",
						mimeType: "image/png",
						data: "ZmFrZS1pbWFnZS1ieXRlcw==",
						mediaResolution: "high",
					}),
				],
			}),
		);
	});

	it("parses fenced JSON model review payloads and preserves task-flow prompt context", async () => {
		const openuiClient = await import("../services/mcp-server/src/openui-client.js");
		const chatSpy = vi
			.spyOn(openuiClient, "openuiChatComplete")
			.mockResolvedValue(
				[
					"```json",
					JSON.stringify({
						score: 88,
						summary: "Structured model review",
						issues: [],
					}),
					"```",
				].join("\n"),
			);

		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: "<main><h1>Checkout</h1><button type='button'>Pay</button></main>",
			invokeModel: true,
			taskFlowCritical: true,
			threshold: 80,
		});

		const payload = JSON.parse(readText(result)) as {
			review: { score: number; passed: boolean };
			modelCritique?: string;
		};

		expect(chatSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("taskFlowCritical=true"),
			}),
		);
		expect(payload.review.score).toBe(88);
		expect(payload.review.passed).toBe(true);
		expect(payload.modelCritique).toBe("Structured model review");
	});

	it("falls back to default model summary when structured parsing fails on blank output", async () => {
		const openuiClient = await import("../services/mcp-server/src/openui-client.js");
		vi.spyOn(openuiClient, "openuiChatComplete").mockResolvedValue("   ");

		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: "<main><h1>Blank</h1></main>",
			invokeModel: true,
			threshold: 80,
		});

		const payload = JSON.parse(readText(result)) as {
			review: { score: number; passed: boolean };
			modelCritique?: string;
		};

		expect(payload.review.score).toBe(100);
		expect(payload.review.passed).toBe(true);
		expect(payload.modelCritique).toBe(
			"Model review completed without structured findings.",
		);
	});

	it("deduplicates heuristic findings when the model reports the same issue id and title", async () => {
		const openuiClient = await import("../services/mcp-server/src/openui-client.js");
		vi.spyOn(openuiClient, "openuiChatComplete").mockResolvedValue(
			JSON.stringify({
				score: 42,
				summary: "Duplicate model finding",
				issues: [
					{
						id: "missing-main-landmark",
						severity: "medium",
						title: "Missing <main> landmark",
						detail: "The document does not define a <main> region.",
						recommendation:
							"Wrap the primary page content in a semantic <main> element.",
						confidence: "high",
						impact: "medium",
						evidenceSnippet: "<div><h2>Heading only</h2></div>",
						priority: "p2",
						principle: "general",
						taskFlowImpact: false,
					},
				],
			}),
		);

		const harness = createToolHarness();
		registerUiuxReviewTool(harness.server);

		const result = await harness.getHandler("openui_review_uiux")({
			html: "<div><h2>Heading only</h2></div>",
			invokeModel: true,
			invokeHeuristics: true,
			threshold: 70,
		});

		const payload = JSON.parse(readText(result)) as {
			review: {
				issues: Array<{ id: string; title: string; source: string }>;
			};
		};

		const duplicateMainIssues = payload.review.issues.filter(
			(issue) =>
				issue.id === "missing-main-landmark" &&
				issue.title === "Missing <main> landmark",
		);
		expect(duplicateMainIssues).toEqual([
			expect.objectContaining({ source: "model" }),
		]);
	});
});
