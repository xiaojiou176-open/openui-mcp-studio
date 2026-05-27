export const DEFAULT_RETRIEVAL_NAMESPACE = "default";
export const DEFAULT_EMBEDDING_DIMENSIONS = 32;

export type RetrievalMetadata = Record<string, unknown>;

export type RetrievalDocumentInput = {
	id: string;
	content: string;
	embedding?: number[];
	metadata?: RetrievalMetadata;
};

export type IndexedRetrievalDocument = {
	id: string;
	content: string;
	embedding: number[];
	metadata: RetrievalMetadata;
	updatedAt: string;
};

export type RetrievalUpsertRequest = {
	namespace?: string;
	documents: RetrievalDocumentInput[];
};

export type RetrievalUpsertResult = {
	namespace: string;
	upserted: number;
	totalDocuments: number;
};

export type RetrievalSearchRequest = {
	namespace?: string;
	queryEmbedding: number[];
	topK?: number;
	minScore?: number;
};

export type RetrievalSearchHit = {
	id: string;
	content: string;
	metadata: RetrievalMetadata;
	score: number;
};

export type RetrievalSearchResult = {
	namespace: string;
	totalCandidates: number;
	hits: RetrievalSearchHit[];
};
