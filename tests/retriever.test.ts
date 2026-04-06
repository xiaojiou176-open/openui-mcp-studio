import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalVectorIndex } from "../services/mcp-server/src/retrieval/local-index.js";
import {
	createLocalRetriever,
	embedTextWithLocalHash,
	LocalRetriever,
} from "../services/mcp-server/src/retrieval/retriever.js";

describe("retriever", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("normalizes non-empty vectors and keeps zero vector for empty text", () => {
		const vector = embedTextWithLocalHash("UI", 16);
		const norm = Math.sqrt(
			vector.reduce((sum, value) => sum + value * value, 0),
		);

		expect(vector).toHaveLength(16);
		expect(Number(norm.toFixed(6))).toBe(1);

		const emptyVector = embedTextWithLocalHash("", 4);
		expect(emptyVector).toHaveLength(8);
		expect(emptyVector.every((value) => value === 0)).toBe(true);
	});

	it("handles astral-plane characters without double-counting surrogate pairs", () => {
		const vector = embedTextWithLocalHash("A😀B", 8);
		const norm = Math.sqrt(
			vector.reduce((sum, value) => sum + value * value, 0),
		);

		expect(vector).toHaveLength(8);
		expect(Number(norm.toFixed(6))).toBe(1);
		expect(vector.some((value) => value !== 0)).toBe(true);
	});

	it("upsert uses document embedding when provided and embeds missing documents", async () => {
		const index = {
			upsert: vi.fn().mockReturnValue({
				namespace: "docs",
				upserted: 2,
				totalDocuments: 2,
			}),
			search: vi.fn(),
			clear: vi.fn(),
		};
		const embedText = vi.fn(async (text: string) => [text.length, 1]);
		const retriever = new LocalRetriever({
			index:
				index as unknown as import("../services/mcp-server/src/retrieval/local-index.js").LocalVectorIndex,
			dimensions: 10,
			embedText,
		});

		const result = await retriever.upsert({
			namespace: "docs",
			documents: [
				{ id: "a", content: "one", embedding: [9, 9] },
				{ id: "b", content: "two" },
			],
		});

		expect(result.upserted).toBe(2);
		expect(embedText).toHaveBeenCalledTimes(1);
		expect(embedText).toHaveBeenCalledWith("two", 10);
		expect(index.upsert).toHaveBeenCalledWith({
			namespace: "docs",
			documents: [
				{ id: "a", content: "one", embedding: [9, 9] },
				{ id: "b", content: "two", embedding: [3, 1] },
			],
		});
	});

	it("search embeds query and forwards topK/minScore; clear delegates to index", async () => {
		const index = {
			upsert: vi.fn(),
			search: vi.fn().mockReturnValue({
				namespace: "docs",
				totalCandidates: 1,
				hits: [{ id: "a", score: 0.9, content: "hello" }],
			}),
			clear: vi.fn(),
		};
		const embedText = vi.fn(async () => [0.4, 0.6]);
		const retriever = createLocalRetriever({
			index:
				index as unknown as import("../services/mcp-server/src/retrieval/local-index.js").LocalVectorIndex,
			embedText,
			dimensions: 12,
		});

		const result = await retriever.search({
			namespace: "docs",
			query: "hello",
			topK: 3,
			minScore: 0.2,
		});

		expect(result.hits).toHaveLength(1);
		expect(embedText).toHaveBeenCalledWith("hello", 12);
		expect(index.search).toHaveBeenCalledWith({
			namespace: "docs",
			queryEmbedding: [0.4, 0.6],
			topK: 3,
			minScore: 0.2,
		});

		retriever.clear("docs");
		expect(index.clear).toHaveBeenCalledWith("docs");
	});

	it("covers local vector index edge branches for namespace, filters and clear", () => {
		const index = new LocalVectorIndex();
		const defaultUpsert = index.upsert({
			documents: [
				{ id: "same-b", content: "b", embedding: [1, 0], metadata: { k: 1 } },
				{ id: "same-a", content: "a", embedding: [1, 0] },
				{ id: "zero", content: "z", embedding: [0, 0] },
			],
		});

		expect(defaultUpsert.namespace).toBe("default");
		expect(defaultUpsert.totalDocuments).toBe(3);

		const searched = index.search({
			queryEmbedding: [1, 0],
			topK: 1,
			minScore: 0.1,
		});
		expect(searched.hits.map((item) => item.id)).toEqual(["same-a"]);

		index.clear("default");
		expect(
			index.search({
				queryEmbedding: [1, 0],
				namespace: " default ",
			}).hits,
		).toHaveLength(0);

		index.upsert({
			namespace: "docs",
			documents: [{ id: "doc", content: "x", embedding: [1, 1] }],
		});
		index.clear();
		expect(
			index.search({
				namespace: "docs",
				queryEmbedding: [1, 1],
			}).hits,
		).toHaveLength(0);
	});

	it("rejects invalid embeddings and query vectors", () => {
		const index = new LocalVectorIndex();
		const sparseEmbedding = new Array<number>(2);
		sparseEmbedding[0] = 1;
		const sparseQueryEmbedding = new Array<number>(2);
		sparseQueryEmbedding[1] = 1;

		expect(() =>
			index.upsert({
				documents: [{ id: "bad-empty", content: "x", embedding: [] }],
			}),
		).toThrow("Invalid embedding for document bad-empty.");
		expect(() =>
			index.upsert({
				documents: [{ id: "bad-nan", content: "x", embedding: [Number.NaN] }],
			}),
		).toThrow("Invalid embedding for document bad-nan.");
		expect(() =>
			index.search({
				queryEmbedding: [],
			}),
		).toThrow("Invalid query embedding.");
		expect(() =>
			index.upsert({
				documents: [
					{ id: "bad-sparse", content: "x", embedding: sparseEmbedding },
				],
			}),
		).toThrow("Invalid embedding for document bad-sparse.");
		expect(() =>
			index.search({
				queryEmbedding: sparseQueryEmbedding,
			}),
		).toThrow("Invalid query embedding.");
	});

	it("rejects blank namespace and invalid topK/minScore inputs", () => {
		const index = new LocalVectorIndex();
		index.upsert({
			namespace: "docs",
			documents: [{ id: "doc-1", content: "a", embedding: [1, 0] }],
		});

		expect(() =>
			index.upsert({
				namespace: "   ",
				documents: [{ id: "doc-2", content: "b", embedding: [1, 0] }],
			}),
		).toThrow("Namespace must be a non-empty string when provided.");
		expect(() =>
			index.search({
				namespace: "\t",
				queryEmbedding: [1, 0],
			}),
		).toThrow("Namespace must be a non-empty string when provided.");
		expect(() => index.clear("   ")).toThrow(
			"Namespace must be a non-empty string when provided.",
		);

		expect(() =>
			index.search({
				namespace: "docs",
				queryEmbedding: [1, 0],
				topK: Number.POSITIVE_INFINITY,
			}),
		).toThrow("Invalid topK: expected a finite integer between 1 and 20.");
		expect(() =>
			index.search({
				namespace: "docs",
				queryEmbedding: [1, 0],
				topK: 0,
			}),
		).toThrow("Invalid topK: expected a finite integer between 1 and 20.");
		expect(() =>
			index.search({
				namespace: "docs",
				queryEmbedding: [1, 0],
				topK: 21,
			}),
		).toThrow("Invalid topK: expected a finite integer between 1 and 20.");
		expect(() =>
			index.search({
				namespace: "docs",
				queryEmbedding: [1, 0],
				topK: 1.5,
			}),
		).toThrow("Invalid topK: expected a finite integer between 1 and 20.");
		expect(() =>
			index.search({
				namespace: "docs",
				queryEmbedding: [1, 0],
				minScore: Number.NaN,
			}),
		).toThrow("Invalid minScore: expected a finite number between -1 and 1.");
		expect(() =>
			index.search({
				namespace: "docs",
				queryEmbedding: [1, 0],
				minScore: 2,
			}),
		).toThrow("Invalid minScore: expected a finite number between -1 and 1.");
	});

	it("locks namespace dimensions on first write and rejects mixed dimensions", () => {
		const index = new LocalVectorIndex();
		index.upsert({
			namespace: "docs",
			documents: [{ id: "doc-1", content: "a", embedding: [1, 0] }],
		});

		expect(() =>
			index.upsert({
				namespace: "docs",
				documents: [{ id: "doc-2", content: "b", embedding: [1, 0, 0] }],
			}),
		).toThrow(
			'Embedding dimension mismatch for namespace "docs": expected 2, got 3 for document doc-2.',
		);

		expect(() =>
			index.search({
				namespace: "docs",
				queryEmbedding: [1, 0, 0],
			}),
		).toThrow(
			'Embedding dimension mismatch for namespace "docs": expected 2, got 3 for query embedding.',
		);
	});

	it("uses default constructor options and handles astral code points", async () => {
		const vector = embedTextWithLocalHash("\u{1F600}A", 8);
		expect(vector).toHaveLength(8);
		expect(vector.some((value) => value !== 0)).toBe(true);

		const embedText = vi.fn(async (text: string, dimensions: number) => [
			text.length,
			dimensions,
		]);
		const retriever = new LocalRetriever({ embedText });

		await retriever.search({ query: "fallback dimensions" });
		expect(embedText).toHaveBeenCalledWith("fallback dimensions", 32);
	});

	it("uses default embedder/index path when options are omitted", async () => {
		const retriever = createLocalRetriever();
		await retriever.upsert({
			namespace: "docs",
			documents: [{ id: "doc-default", content: "alpha beta gamma" }],
		});

		const result = await retriever.search({
			namespace: "docs",
			query: "alpha beta gamma",
			topK: 1,
		});

		expect(result.hits[0]?.id).toBe("doc-default");
	});

	it("rejects sparse embeddings instead of treating holes as zero", () => {
		const index = new LocalVectorIndex();
		const sparseEmbedding = new Array<number>(2);

		expect(() =>
			index.upsert({
				namespace: "sparse",
				documents: [
					{ id: "s1", content: "sparse", embedding: sparseEmbedding },
				],
			}),
		).toThrow("Invalid embedding for document s1.");
	});
});
