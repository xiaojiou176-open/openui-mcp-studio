import { afterEach, describe, expect, it, vi } from "vitest";

const registerApplyTool = vi.fn();
const registerComputerUseTool = vi.fn();
const registerConvertTools = vi.fn();
const registerDetectTool = vi.fn();
const registerEmbedTool = vi.fn();
const registerGenerateTool = vi.fn();
const registerModelsTool = vi.fn();
const registerQualityTool = vi.fn();
const registerRagTool = vi.fn();
const registerRefineTool = vi.fn();
const registerShipTool = vi.fn();
const registerSmokeTool = vi.fn();
const registerUiuxReviewTool = vi.fn();
const detectShadcnPaths = vi.fn();
const logInfo = vi.fn();
const validateOpenuiRuntimeConfig = vi.fn();
const buildDefaultShadcnStyleGuide = vi.fn();
const getWorkspaceRoot = vi.fn();
const getOpenuiModelRoutingMode = vi.fn();
const getOpenuiMcpLogLevel = vi.fn();

const createdServers: FakeMcpServer[] = [];
const createdTransports: FakeStdioServerTransport[] = [];

type ResourceHandler = () => Promise<{
	contents: Array<{ uri: string; mimeType: string; text: string }>;
}>;

class FakeMcpServer {
	public readonly options: { name: string; version: string };

	public readonly resourceRegistrations: Array<{
		id: string;
		uri: string;
		metadata: { title: string; description: string; mimeType: string };
		handler: ResourceHandler;
	}> = [];

	public connect = vi.fn(async () => undefined);

	constructor(options: { name: string; version: string }) {
		this.options = options;
		createdServers.push(this);
	}

	registerResource(
		id: string,
		uri: string,
		metadata: { title: string; description: string; mimeType: string },
		handler: ResourceHandler,
	): void {
		this.resourceRegistrations.push({ id, uri, metadata, handler });
	}
}

class FakeStdioServerTransport {
	constructor() {
		createdTransports.push(this);
	}
}

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
	McpServer: FakeMcpServer,
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
	StdioServerTransport: FakeStdioServerTransport,
}));

vi.mock("../services/mcp-server/src/constants.js", () => ({
	MCP_SERVER_VERSION: "9.9.9-test",
	buildDefaultShadcnStyleGuide,
	getOpenuiMcpLogLevel,
	getOpenuiModelRoutingMode,
	getWorkspaceRoot,
	validateOpenuiRuntimeConfig,
}));

vi.mock("../services/mcp-server/src/logger.js", () => ({
	logInfo,
}));

vi.mock("../services/mcp-server/src/path-detection.js", () => ({
	detectShadcnPaths,
}));

vi.mock("../services/mcp-server/src/tools/apply.js", () => ({
	registerApplyTool,
}));
vi.mock("../services/mcp-server/src/tools/computer-use.js", () => ({
	registerComputerUseTool,
}));
vi.mock("../services/mcp-server/src/tools/convert.js", () => ({
	registerConvertTools,
}));
vi.mock("../services/mcp-server/src/tools/detect.js", () => ({
	registerDetectTool,
}));
vi.mock("../services/mcp-server/src/tools/embed.js", () => ({
	registerEmbedTool,
}));
vi.mock("../services/mcp-server/src/tools/generate.js", () => ({
	registerGenerateTool,
}));
vi.mock("../services/mcp-server/src/tools/models.js", () => ({
	registerModelsTool,
}));
vi.mock("../services/mcp-server/src/tools/quality.js", () => ({
	registerQualityTool,
}));
vi.mock("../services/mcp-server/src/tools/rag.js", () => ({ registerRagTool }));
vi.mock("../services/mcp-server/src/tools/refine.js", () => ({
	registerRefineTool,
}));
vi.mock("../services/mcp-server/src/tools/ship.js", () => ({
	registerShipTool,
}));
vi.mock("../services/mcp-server/src/tools/smoke.js", () => ({
	registerSmokeTool,
}));
vi.mock("../services/mcp-server/src/tools/uiux-review.js", () => ({
	registerUiuxReviewTool,
}));

afterEach(() => {
	createdServers.length = 0;
	createdTransports.length = 0;
	vi.restoreAllMocks();
});

describe("index server bootstrap", () => {
	it("creates server, registers tools, and resolves default style-guide resource", async () => {
		detectShadcnPaths.mockResolvedValue({
			uiImportBase: "@/components/ui",
		});
		buildDefaultShadcnStyleGuide.mockReturnValue("style-guide");

		const mod = await import("../services/mcp-server/src/index.js");
		const server = mod.createServer() as unknown as FakeMcpServer;

		expect(validateOpenuiRuntimeConfig).toHaveBeenCalledTimes(1);
		expect(server.options).toEqual({
			name: "openui-mcp-studio",
			version: "9.9.9-test",
		});

		const allRegisterFns = [
			registerDetectTool,
			registerModelsTool,
			registerGenerateTool,
			registerRefineTool,
			registerConvertTools,
			registerApplyTool,
			registerEmbedTool,
			registerRagTool,
			registerComputerUseTool,
			registerUiuxReviewTool,
			registerQualityTool,
			registerSmokeTool,
			registerShipTool,
		];
		for (const fn of allRegisterFns) {
			expect(fn).toHaveBeenCalledWith(server);
		}

		expect(server.resourceRegistrations).toHaveLength(1);
		const resource = server.resourceRegistrations[0];
		expect(resource.id).toBe("openui_styleguide_default");
		expect(resource.uri).toBe("openui://styleguide/default");

		const resolved = await resource.handler();
		expect(detectShadcnPaths).toHaveBeenCalledTimes(1);
		expect(buildDefaultShadcnStyleGuide).toHaveBeenCalledWith(
			"@/components/ui",
		);
		expect(resolved.contents).toEqual([
			{
				uri: "openui://styleguide/default",
				mimeType: "text/plain",
				text: "style-guide",
			},
		]);
	});

	it("connects stdio transport and emits startup telemetry", async () => {
		getWorkspaceRoot.mockReturnValue("/workspace");
		getOpenuiModelRoutingMode.mockReturnValue("balanced");
		getOpenuiMcpLogLevel.mockReturnValue("debug");

		const mod = await import("../services/mcp-server/src/index.js");
		await mod.runStdioServer();

		expect(createdServers).toHaveLength(1);
		expect(createdTransports).toHaveLength(1);
		expect(createdServers[0]?.connect).toHaveBeenCalledWith(
			createdTransports[0],
		);
		expect(logInfo).toHaveBeenCalledWith("mcp_server_started", {
			traceId: "mcp_server_runtime",
			stage: "startup",
			provider: "gemini",
			context: {
				workspaceRoot: "/workspace",
				modelRoutingMode: "balanced",
				logLevel: "debug",
			},
		});
	});
});
