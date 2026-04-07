import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const SOCIAL_PREVIEW_ROUTE = "/api/social-preview";
export const SOCIAL_PREVIEW_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600";

const SOCIAL_PREVIEW_ASSET_URL = new URL(
	"../../../docs/assets/openui-mcp-studio-social-preview.png",
	import.meta.url,
);

export function resolveSocialPreviewAssetPath(): string {
	return fileURLToPath(SOCIAL_PREVIEW_ASSET_URL);
}

export async function buildSocialPreviewResponse(input?: {
	assetPath?: string;
	readFile?: typeof fs.readFile;
}): Promise<Response> {
	const assetPath = input?.assetPath ?? resolveSocialPreviewAssetPath();
	const readFile = input?.readFile ?? fs.readFile;

	try {
		const imageBuffer = await readFile(assetPath);
		return new Response(imageBuffer, {
			headers: {
				"Content-Type": "image/png",
				"Cache-Control": SOCIAL_PREVIEW_CACHE_CONTROL,
			},
		});
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return new Response("Not found", { status: 404 });
		}

		return new Response("Internal Server Error", { status: 500 });
	}
}
