import { buildSocialPreviewResponse } from "../../../lib/social-preview";

export async function GET(): Promise<Response> {
	return buildSocialPreviewResponse();
}
