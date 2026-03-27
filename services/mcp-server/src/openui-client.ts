import { aiChatComplete, aiListModels } from "./ai-client.js";
import type { AiCompleteInput } from "./providers/types.js";

export type ChatCompleteInput = AiCompleteInput;

export async function openuiChatComplete(
	input: ChatCompleteInput,
): Promise<string> {
	return aiChatComplete(input);
}

export async function openuiListModels(limit = 120): Promise<unknown> {
	return aiListModels(limit);
}
