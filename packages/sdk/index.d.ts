export declare const OPENUI_SDK_MANIFEST: {
  packageName: string;
  version: string;
  summary: string;
  audience: string;
  role: string;
  nonGoals: string[];
};

export declare class OpenuiHostedApiError extends Error {
  status: number | null;
  code: string | null;
  requestId: string | null;
  body: unknown;
}

export type OpenuiHostedClientOptions = {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
};

export declare class OpenuiHostedClient {
  constructor(options: OpenuiHostedClientOptions);
  health(): Promise<unknown>;
  getInfo(): Promise<unknown>;
  frontdoor(): Promise<unknown>;
  ecosystem(): Promise<unknown>;
  skillsManifest(): Promise<unknown>;
  openapi(): Promise<unknown>;
  workflowSummary(args?: Record<string, unknown>): Promise<unknown>;
  listTools(): Promise<unknown>;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
}

export declare function createOpenuiHostedClient(
  options: OpenuiHostedClientOptions,
): OpenuiHostedClient;
