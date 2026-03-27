import { describe, expect, it } from "vitest";
import {
	extractJsonObject,
	tryParseJson,
} from "../services/mcp-server/src/json-utils.js";

describe("json utils", () => {
	it("extracts fenced json blocks and parses valid payloads", () => {
		const raw = 'prefix\n```json\n{"ok":true,"v":1}\n```\nsuffix';
		const extracted = extractJsonObject(raw);
		expect(extracted).toBe('{"ok":true,"v":1}');
		expect(tryParseJson<{ ok: boolean; v: number }>(extracted || "")).toEqual({
			ok: true,
			v: 1,
		});
	});

	it("returns null for invalid json and missing object delimiters", () => {
		expect(tryParseJson("{broken")).toBeNull();
		expect(extractJsonObject("no-json-here")).toBeNull();
		expect(extractJsonObject("prefix } only")).toBeNull();
	});

	it("ignores non-json fenced blocks and falls back to object delimiters", () => {
		const raw = 'prefix\n```ts\nconst x = 1;\n```\n{"ok":true}\n';
		expect(extractJsonObject(raw)).toBe('{"ok":true}');
	});
});
