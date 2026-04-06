import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	findOpenPort,
	pathExists,
	waitForHttpReady,
} from "../packages/shared-runtime/src/runtime-ops.js";

const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

type MockServerInput = {
	addressResult: net.AddressInfo | string | null;
	listenError?: Error;
	closeError?: Error;
};

function createMockServer(input: MockServerInput): net.Server {
	const emitter = new EventEmitter();
	const server = {
		once(event: string, handler: (...args: unknown[]) => void) {
			emitter.once(event, handler);
			return server;
		},
		listen(_port: number, _host: string, callback?: () => void) {
			queueMicrotask(() => {
				if (input.listenError) {
					emitter.emit("error", input.listenError);
					return;
				}
				callback?.();
			});
			return server;
		},
		address() {
			return input.addressResult;
		},
		close(callback?: (error?: Error | null) => void) {
			queueMicrotask(() => callback?.(input.closeError ?? null));
			return server;
		},
	};

	return server as unknown as net.Server;
}

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	vi.restoreAllMocks();
	globalThis.fetch = originalFetch;
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("runtime ops", () => {
	it("returns true when a path exists and false when it does not", async () => {
		const tempDir = await mkTempDir("openui-runtime-ops-");
		const filePath = path.join(tempDir, "marker.txt");
		const missingPath = path.join(tempDir, "missing.txt");

		await fs.writeFile(filePath, "ok", "utf8");

		await expect(pathExists(filePath)).resolves.toBe(true);
		await expect(pathExists(missingPath)).resolves.toBe(false);
	});

	it("allocates an ephemeral local port", async () => {
		const port = await findOpenPort();
		expect(port).toBeGreaterThan(0);
		expect(Number.isInteger(port)).toBe(true);
	});

	it("rejects when address information is unavailable", async () => {
		vi.spyOn(net, "createServer").mockReturnValue(
			createMockServer({
				addressResult: "not-a-tcp-address",
			}),
		);

		await expect(findOpenPort()).rejects.toThrow(
			"Failed to allocate local port.",
		);
	});

	it("rejects when server close fails", async () => {
		vi.spyOn(net, "createServer").mockReturnValue(
			createMockServer({
				addressResult: {
					address: "127.0.0.1",
					family: "IPv4",
					port: 39123,
				},
				closeError: new Error("close failed"),
			}),
		);

		await expect(findOpenPort()).rejects.toThrow("close failed");
	});

	it("rejects when socket listen emits error", async () => {
		vi.spyOn(net, "createServer").mockReturnValue(
			createMockServer({
				addressResult: {
					address: "127.0.0.1",
					family: "IPv4",
					port: 39124,
				},
				listenError: new Error("listen failed"),
			}),
		);

		await expect(findOpenPort()).rejects.toThrow("listen failed");
	});

	it("waitForHttpReady returns when endpoint becomes healthy", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("not-ready", { status: 503 }))
			.mockRejectedValueOnce(new Error("temporary network"))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await expect(
			waitForHttpReady("http://127.0.0.1:3000/healthz", 200, {
				requestTimeoutMs: 20,
				pollIntervalMs: 1,
			}),
		).resolves.toBeUndefined();

		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("waitForHttpReady uses default timing options when input is omitted", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("ok", { status: 200 }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await expect(
			waitForHttpReady("http://127.0.0.1:3000/healthz", 50),
		).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("waitForHttpReady throws with last stringified error on timeout", async () => {
		const fetchMock = vi.fn().mockRejectedValue("connection reset");
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await expect(
			waitForHttpReady("http://127.0.0.1:3000/healthz", 15, {
				requestTimeoutMs: 10,
				pollIntervalMs: 1,
			}),
		).rejects.toThrow(/connection reset/);
	});
});
