import { describe, expect, it, vi } from "vitest";
import * as nextSmokeRunner from "../services/mcp-server/src/next-smoke/run.js";
import { runNextSmoke } from "../services/mcp-server/src/next-smoke.js";

describe("next-smoke public export", () => {
	it("delegates runNextSmoke to the runner module", async () => {
		const spy = vi
			.spyOn(nextSmokeRunner, "runNextSmoke")
			.mockResolvedValueOnce({ passed: true } as never);

		const result = await runNextSmoke({ targetRoot: "apps/web" });

		expect(spy).toHaveBeenCalledWith({
			targetRoot: "apps/web",
		});
		expect(result).toEqual({ passed: true });
	});
});
