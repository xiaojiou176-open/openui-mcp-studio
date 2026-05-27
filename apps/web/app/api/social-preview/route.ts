import { buildSocialPreviewResponse } from "../../../lib/social-preview";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
	return buildSocialPreviewResponse();
}
