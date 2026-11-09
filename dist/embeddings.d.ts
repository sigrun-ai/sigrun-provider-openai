/**
 * The OpenAI Embeddings API as a sigrun embedding provider (spec §3).
 *
 * One provider request becomes one or more `POST <baseUrl>/embeddings`
 * calls: core splits by the model's `maxBatch` (input count), and this
 * module splits again by the endpoint's per-request TOKEN ceiling, which is
 * estimated at four characters per token — the same rough ratio OpenAI
 * documents. Both limits apply to every HTTP request.
 *
 * Vectors come back in input order: the wire carries an `index` per entry
 * and nothing guarantees the array order, so the response is re-sorted by
 * it (a missing/duplicate/out-of-range index is a malformed response, not a
 * guessing game).
 *
 * Failure messages never carry the credential or the input text: a non-2xx
 * body is truncated to a short snippet with both scrubbed out.
 */
import type { EmbeddingProviderContribution } from "@sigrun/sigrun/extension";
import type { OpenAIEmbeddingModelSettings } from "./settings.js";
/** The endpoint's per-request token ceiling, in ESTIMATED tokens. */
export declare const EMBEDDING_REQUEST_TOKEN_BUDGET = 300000;
/**
 * Whether `hostname` is loopback or a private address — the provider's own
 * view of where a model runs (`EmbeddingModelInfo.local`). `hostname` comes
 * from `new URL(baseUrl).hostname`, so an IPv6 literal keeps its brackets.
 * An IPv4-mapped IPv6 literal is judged by the address it maps.
 */
export declare function isLocalHost(hostname: string): boolean;
/**
 * The embedding-provider contribution. `models` come from the scoped
 * settings; `local` is this provider's own view of the endpoint (a host
 * that is not a loopback or private address is never local, however the
 * admin lists it). `embed` throws for transport, response and configuration
 * failures; core maps a throw to `failed`.
 */
export declare function createOpenAIEmbeddings(baseUrl: string, models: readonly OpenAIEmbeddingModelSettings[], maxBatch: number): EmbeddingProviderContribution;
