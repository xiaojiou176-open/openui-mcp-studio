import {
	DEFAULT_RETRIEVAL_NAMESPACE,
	type IndexedRetrievalDocument,
	type RetrievalSearchRequest,
	type RetrievalSearchResult,
	type RetrievalUpsertRequest,
	type RetrievalUpsertResult,
} from "./types.js";

type NamespaceStore = Map<string, IndexedRetrievalDocument>;
type NamespaceState = {
	documents: NamespaceStore;
	dimensions?: number;
};

function normalizeNamespace(namespace?: string): string {
	if (namespace === undefined) {
		return DEFAULT_RETRIEVAL_NAMESPACE;
	}

	const value = namespace.trim();
	if (!value) {
		throw new Error("Namespace must be a non-empty string when provided.");
	}

	return value;
}

function normalizeTopK(topK?: number): number {
	if (topK === undefined) {
		return 5;
	}

	if (
		!Number.isFinite(topK) ||
		!Number.isInteger(topK) ||
		topK < 1 ||
		topK > 20
	) {
		throw new Error(
			"Invalid topK: expected a finite integer between 1 and 20.",
		);
	}

	return topK;
}

function normalizeMinScore(minScore?: number): number {
	if (minScore === undefined) {
		return 0;
	}

	if (!Number.isFinite(minScore) || minScore < -1 || minScore > 1) {
		throw new Error(
			"Invalid minScore: expected a finite number between -1 and 1.",
		);
	}

	return minScore;
}

function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length === 0 || b.length === 0) {
		return 0;
	}
	if (a.length !== b.length) {
		throw new Error(
			`Embedding dimension mismatch during similarity calculation: left=${a.length}, right=${b.length}.`,
		);
	}

	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i += 1) {
		const left = a[i] ?? 0;
		const right = b[i] ?? 0;
		dot += left * right;
		normA += left * left;
		normB += right * right;
	}

	if (normA === 0 || normB === 0) {
		return 0;
	}

	return dot / Math.sqrt(normA * normB);
}

function isValidEmbedding(embedding: number[]): boolean {
	if (embedding.length === 0) {
		return false;
	}

	for (let index = 0; index < embedding.length; index += 1) {
		if (!(index in embedding)) {
			return false;
		}
		if (!Number.isFinite(embedding[index])) {
			return false;
		}
	}

	return true;
}

export class LocalVectorIndex {
	private readonly store = new Map<string, NamespaceState>();

	private getOrCreateNamespaceState(namespace: string): NamespaceState {
		const existing = this.store.get(namespace);
		if (existing) {
			return existing;
		}

		const created: NamespaceState = {
			documents: new Map<string, IndexedRetrievalDocument>(),
		};
		this.store.set(namespace, created);
		return created;
	}

	private buildDimensionMismatchError(
		namespace: string,
		expected: number,
		actual: number,
		context: string,
	): Error {
		return new Error(
			`Embedding dimension mismatch for namespace "${namespace}": expected ${expected}, got ${actual} for ${context}.`,
		);
	}

	upsert(request: RetrievalUpsertRequest): RetrievalUpsertResult {
		const namespace = normalizeNamespace(request.namespace);
		const namespaceState = this.getOrCreateNamespaceState(namespace);
		const preparedDocuments = request.documents.map((document) => {
			const embedding = document.embedding ?? [];
			if (!isValidEmbedding(embedding)) {
				throw new Error(`Invalid embedding for document ${document.id}.`);
			}
			return {
				id: document.id,
				content: document.content,
				embedding,
				metadata: document.metadata ?? {},
			};
		});

		if (preparedDocuments.length > 0) {
			const expectedDimensions =
				namespaceState.dimensions ?? preparedDocuments[0].embedding.length;

			for (const document of preparedDocuments) {
				if (document.embedding.length !== expectedDimensions) {
					throw this.buildDimensionMismatchError(
						namespace,
						expectedDimensions,
						document.embedding.length,
						`document ${document.id}`,
					);
				}
			}

			namespaceState.dimensions = expectedDimensions;
		}

		for (const document of preparedDocuments) {
			namespaceState.documents.set(document.id, {
				id: document.id,
				content: document.content,
				embedding: document.embedding,
				metadata: document.metadata,
				updatedAt: new Date().toISOString(),
			});
		}

		return {
			namespace,
			upserted: request.documents.length,
			totalDocuments: namespaceState.documents.size,
		};
	}

	search(request: RetrievalSearchRequest): RetrievalSearchResult {
		const namespace = normalizeNamespace(request.namespace);
		if (!isValidEmbedding(request.queryEmbedding ?? [])) {
			throw new Error("Invalid query embedding.");
		}
		const namespaceState = this.store.get(namespace);
		if (!namespaceState) {
			return {
				namespace,
				totalCandidates: 0,
				hits: [],
			};
		}
		if (
			namespaceState.dimensions !== undefined &&
			request.queryEmbedding.length !== namespaceState.dimensions
		) {
			throw this.buildDimensionMismatchError(
				namespace,
				namespaceState.dimensions,
				request.queryEmbedding.length,
				"query embedding",
			);
		}
		const topK = normalizeTopK(request.topK);
		const minScore = normalizeMinScore(request.minScore);

		const hits = Array.from(namespaceState.documents.values())
			.map((document) => ({
				id: document.id,
				content: document.content,
				metadata: document.metadata,
				score: Number(
					cosineSimilarity(request.queryEmbedding, document.embedding).toFixed(
						6,
					),
				),
			}))
			.filter((hit) => hit.score >= minScore)
			.sort((left, right) => {
				if (right.score !== left.score) {
					return right.score - left.score;
				}
				return left.id.localeCompare(right.id);
			})
			.slice(0, topK);

		return {
			namespace,
			totalCandidates: namespaceState.documents.size,
			hits,
		};
	}

	clear(namespace?: string): void {
		if (namespace !== undefined) {
			this.store.delete(normalizeNamespace(namespace));
			return;
		}

		this.store.clear();
	}
}
