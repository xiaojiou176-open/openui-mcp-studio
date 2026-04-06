export function tryParseJson<T>(raw: string): T | null {
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function extractFencedJsonBlock(raw: string): string | null {
	const fenceStart = raw.indexOf("```");
	if (fenceStart === -1) {
		return null;
	}

	const headerEnd = raw.indexOf("\n", fenceStart + 3);
	if (headerEnd === -1) {
		return null;
	}

	const fenceHeader = raw.slice(fenceStart + 3, headerEnd).trim().toLowerCase();
	if (fenceHeader !== "" && fenceHeader !== "json") {
		return null;
	}

	const fenceEnd = raw.indexOf("```", headerEnd + 1);
	if (fenceEnd === -1 || fenceEnd <= headerEnd) {
		return null;
	}

	return raw.slice(headerEnd + 1, fenceEnd).trim();
}

export function extractJsonObject(raw: string): string | null {
	const fencedJson = extractFencedJsonBlock(raw);
	if (fencedJson) {
		return fencedJson;
	}

	const firstBrace = raw.indexOf("{");
	const lastBrace = raw.lastIndexOf("}");
	if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
		return null;
	}

	return raw.slice(firstBrace, lastBrace + 1).trim();
}
