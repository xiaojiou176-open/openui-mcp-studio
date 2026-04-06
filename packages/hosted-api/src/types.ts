import type { Server } from "node:http";

export type HostedApiToolDescriptor = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
};

export type HostedApiToolResult = {
	content: Array<Record<string, unknown>>;
	isError?: boolean;
	metadata?: Record<string, unknown>;
};

export type HostedApiServerOptions = {
	workspaceRoot: string;
	authToken: string;
	host?: string;
	port?: number;
	publicBaseUrl?: string | null;
	rateLimitWindowMs?: number;
	rateLimitMax?: number;
	logger?: (event: Record<string, unknown>) => void;
};

export type HostedApiServerHandle = {
	server: Server;
	port: number;
	url: string;
	close: () => Promise<void>;
};
