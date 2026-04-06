import { describe, expect, it } from "vitest";
import { runRepoBrowserVerifyCli } from "../tooling/cli/repo-browser-verify.mjs";

function createBufferWriter() {
	let value = "";
	return {
		stream: {
			write(chunk: string | Uint8Array) {
				value += String(chunk);
				return true;
			},
		},
		read() {
			return value;
		},
	};
}

describe("repo browser verify cli", () => {
	it("authorizes detached launch for the repo-owned verify entrypoint", async () => {
		let capturedOptions = null;
		const stdout = createBufferWriter();
		const exitCode = await runRepoBrowserVerifyCli({
			env: {},
			stdout: stdout.stream,
			verify: async (options) => {
				capturedOptions = options;
				return { ok: true };
			},
		});

		expect(exitCode).toBe(0);
		expect(stdout.read()).toContain('"ok": true');
		expect(capturedOptions).toMatchObject({
			env: expect.objectContaining({
				OPENUI_CHROME_ALLOW_DETACHED_LAUNCH: "1",
			}),
		});
	});
});
