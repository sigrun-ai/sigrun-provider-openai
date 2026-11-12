/**
 * The embedding models this provider publishes, with their vector
 * dimensions. The set is fixed at load (plan 3 Task 1): core's embedding
 * contribution has no refresh hook, so the full recognized set is offered
 * rather than intersected with `GET /v1/models`; an id the account cannot
 * use fails at call time, as before. The old `embeddings.models` settings
 * key is gone — a stored list is an unknown key on core's Advanced pane.
 */
export interface KnownEmbeddingModel {
	readonly id: string;
	readonly dimensions: number;
}

export const KNOWN_EMBEDDING_MODELS: readonly KnownEmbeddingModel[] = [
	{ id: "text-embedding-3-small", dimensions: 1536 },
	{ id: "text-embedding-3-large", dimensions: 3072 },
	{ id: "text-embedding-ada-002", dimensions: 1536 },
];
