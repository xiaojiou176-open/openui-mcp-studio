import { LocalVectorIndex } from "./local-index.js";
import {
	DEFAULT_EMBEDDING_DIMENSIONS,
	type RetrievalDocumentInput,
	type RetrievalSearchResult,
	type RetrievalUpsertResult,
} from "./types.js";

export type EmbedTextFn = (
	text: string,
	dimensions: number,
) => Promise<number[]>;

export function embedTextWithLocalHash(
	text: string,
	dimensions = DEFAULT_EMBEDDING_DIMENSIONS,
): number[] {
	const size = Math.max(8, Math.floor(dimensions));
	const vector = new Array<number>(size).fill(0);

	for (let index = 0; index < text.length; index += 1) {
		const codePoint = text.codePointAt(index);
		if (codePoint === undefined) {
			continue;
		}

		const slot = Math.abs((codePoint + index * 31) % size);
		const magnitude = ((codePoint % 97) + 1) / 97;
		const direction = index % 2 === 0 ? 1 : -1;
		vector[slot] += magnitude * direction;

		if (codePoint > 0xffff) {
			index += 1;
		}
	}

	const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
	if (norm === 0) {
		return vector;
	}

	return vector.map((value) => Number((value / norm).toFixed(6)));
}

type RetrieverUpsertInput = {
	namespace?: string;
	documents: RetrievalDocumentInput[];
	dimensions?: number;
};

type RetrieverSearchInput = {
	namespace?: string;
	query: string;
	topK?: number;
	minScore?: number;
	dimensions?: number;
};

type LocalRetrieverOptions = {
	index?: LocalVectorIndex;
	dimensions?: number;
	embedText?: EmbedTextFn;
};

export class LocalRetriever {
	private readonly index: LocalVectorIndex;
	private readonly defaultDimensions: number;
	private readonly embedText: EmbedTextFn;

	constructor(options: LocalRetrieverOptions = {}) {
		this.index = options.index ?? new LocalVectorIndex();
		this.defaultDimensions = options.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
		this.embedText =
			options.embedText ??
			(async (text, dimensions) => embedTextWithLocalHash(text, dimensions));
	}

	async upsert(input: RetrieverUpsertInput): Promise<RetrievalUpsertResult> {
		const dimensions = input.dimensions ?? this.defaultDimensions;
		const documents = await Promise.all(
			input.documents.map(async (document) => ({
				...document,
				embedding:
					document.embedding ??
					(await this.embedText(document.content, dimensions)),
			})),
		);

		return this.index.upsert({
			namespace: input.namespace,
			documents,
		});
	}

	async search(input: RetrieverSearchInput): Promise<RetrievalSearchResult> {
		const dimensions = input.dimensions ?? this.defaultDimensions;
		const queryEmbedding = await this.embedText(input.query, dimensions);
		return this.index.search({
			namespace: input.namespace,
			queryEmbedding,
			topK: input.topK,
			minScore: input.minScore,
		});
	}

	clear(namespace?: string): void {
		this.index.clear(namespace);
	}
}

export function createLocalRetriever(
	options?: LocalRetrieverOptions,
): LocalRetriever {
	return new LocalRetriever(options);
}
