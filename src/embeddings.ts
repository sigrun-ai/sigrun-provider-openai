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
import type {
	EmbeddingContext,
	EmbeddingModelInfo,
	EmbeddingProviderContribution,
	EmbeddingRequest,
	EmbeddingResponse,
} from "@sigrun/sigrun/extension";
import { createOpenAIReadiness } from "./readiness.js";
import { KNOWN_EMBEDDING_MODELS } from "./known-models.js";

/**
 * The message prefix for every error this module raises. Deliberately the
 * plugin's own name rather than the vendor's: these strings reach operators
 * through core's failure result and this provider's readiness detail, and a
 * plugin-named prefix is unambiguous there.
 */
const PREFIX = "provider-openai embeddings";
/** The endpoint's per-request token ceiling, in ESTIMATED tokens. */
export const EMBEDDING_REQUEST_TOKEN_BUDGET = 300_000;
/**
 * The estimation ratio: four characters per token. An empty string counts as
 * one token (the endpoint bills a minimum), so a batch of empty inputs still
 * advances the budget instead of looking free.
 */
const CHARS_PER_TOKEN = 4;
/** How much of a failing response body reaches the error message. */
const BODY_SNIPPET_CHARS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function octets(address: string): number[] | undefined {
	const parts = address.split(".");
	if (parts.length !== 4) return undefined;
	const parsed = parts.map((part) => (/^\d{1,3}$/u.test(part) ? Number(part) : Number.NaN));
	if (parsed.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined;
	return parsed;
}

/** The dotted-quad classes: loopback 127/8, private 10/8, 172.16/12, 192.168/16. */
function isLocalIPv4(address: string): boolean {
	const parsed = octets(address);
	if (parsed === undefined) return false;
	const first = parsed[0] ?? Number.NaN;
	const second = parsed[1] ?? Number.NaN;
	if (first === 127) return true;
	if (first === 10) return true;
	if (first === 172 && second >= 16 && second <= 31) return true;
	return first === 192 && second === 168;
}

/** The IPv6 classes: loopback `::1` and unique-local `fc00::/7`. */
function isLocalIPv6(address: string): boolean {
	const lower = address.toLowerCase();
	if (lower === "::1") return true;
	const first = lower.split(":")[0] ?? "";
	if (!/^[0-9a-f]{1,4}$/u.test(first)) return false;
	return (Number.parseInt(first, 16) & 0xfe00) === 0xfc00;
}

/**
 * Whether `hostname` is loopback or a private address — the provider's own
 * view of where a model runs (`EmbeddingModelInfo.local`). `hostname` comes
 * from `new URL(baseUrl).hostname`, so an IPv6 literal keeps its brackets.
 * An IPv4-mapped IPv6 literal is judged by the address it maps.
 */
export function isLocalHost(hostname: string): boolean {
	const host = hostname.trim().toLowerCase().replace(/^\[/u, "").replace(/\]$/u, "");
	if (host === "") return false;
	if (host === "localhost") return true;
	const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(host);
	if (dotted !== null) return isLocalIPv4(dotted[1]!);
	const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(host);
	if (mapped !== null) {
		const high = Number.parseInt(mapped[1]!, 16);
		const low = Number.parseInt(mapped[2]!, 16);
		return isLocalIPv4([high >> 8, high & 0xff, low >> 8, low & 0xff].join("."));
	}
	if (host.includes(":")) return isLocalIPv6(host);
	return isLocalIPv4(host);
}

/**
 * Whether a thrown value is a caller cancellation rather than a provider
 * failure. Node's `fetch` rejects with a `DOMException` named `AbortError`;
 * the abort flag covers an implementation that rejects some other way after
 * the signal fired. A cancellation says nothing about the endpoint's health,
 * so it must not degrade readiness.
 */
function isAbort(error: unknown, signal: AbortSignal): boolean {
	if (signal.aborted) return true;
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { name?: unknown }).name === "AbortError"
	);
}

/** The provider's estimated token count for one input text (never below 1). */
function estimateTokens(text: string): number {
	return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/**
 * Split this provider request's inputs into per-HTTP-request batches: each
 * batch holds at most `maxBatch` inputs AND stays within `budget` estimated
 * tokens. An input that exceeds the budget on its own is sent alone — the
 * estimate is a heuristic and the endpoint, not the estimate, has the final
 * say on a single input.
 */
function splitInputs(
	input: readonly string[],
	maxBatch: number,
	budget: number,
): string[][] {
	const batches: string[][] = [];
	let batch: string[] = [];
	let tokens = 0;
	for (const text of input) {
		const estimate = estimateTokens(text);
		if (batch.length > 0 && (batch.length >= maxBatch || tokens + estimate > budget)) {
			batches.push(batch);
			batch = [];
			tokens = 0;
		}
		batch.push(text);
		tokens += estimate;
	}
	if (batch.length > 0) batches.push(batch);
	return batches;
}

/**
 * The error text for a failing response: the status plus a short snippet,
 * with the credential AND the submitted inputs scrubbed out (the message
 * reaches both core's failure result and this provider's readiness detail,
 * and neither may carry either).
 */
function failureMessage(
	status: number,
	body: string,
	credential: string | undefined,
	input: readonly string[],
): string {
	let message = body.replace(/\s+/gu, " ").trim();
	for (const sensitive of [credential, ...input]) {
		if (sensitive !== undefined && sensitive !== "") message = message.replaceAll(sensitive, "[redacted]");
	}
	const snippet = message.slice(0, BODY_SNIPPET_CHARS);
	return `${PREFIX} returned ${status}${snippet === "" ? "" : `: ${snippet}`}`;
}

/**
 * The embeddings of one response body, in `index` order. A body whose entry
 * count, indexes or vector shape do not match the inputs is malformed.
 */
function parseVectors(payload: unknown, expected: number): number[][] {
	if (!isRecord(payload) || !Array.isArray(payload.data)) {
		throw new Error(`${PREFIX} returned an unexpected response`);
	}
	if (payload.data.length !== expected) {
		throw new Error(`${PREFIX} returned ${payload.data.length} vectors for ${expected} inputs`);
	}
	const vectors = new Array<number[] | undefined>(expected);
	for (const [position, entry] of payload.data.entries()) {
		if (!isRecord(entry) || !Array.isArray(entry.embedding)) {
			throw new Error(`${PREFIX} returned an entry without an embedding`);
		}
		const index = entry.index === undefined ? position : entry.index;
		if (
			typeof index !== "number" ||
			!Number.isInteger(index) ||
			index < 0 ||
			index >= expected ||
			vectors[index] !== undefined
		) {
			throw new Error(`${PREFIX} returned an out-of-range or duplicate index`);
		}
		const vector = entry.embedding;
		if (vector.some((element) => typeof element !== "number")) {
			throw new Error(`${PREFIX} returned a non-numeric embedding element`);
		}
		vectors[index] = vector as number[];
	}
	return vectors as number[][];
}

/**
 * The embedding-provider contribution. `models` are KNOWN_EMBEDDING_MODELS
 * (fixed at load; a stored settings list is an unknown key). `local` is this
 * provider's own view of the endpoint (a host that is not a loopback or
 * private address is never local, however the admin lists it). `embed`
 * throws for transport, response and configuration failures; core maps a
 * throw to `failed`.
 */
export function createOpenAIEmbeddings(
	baseUrl: string,
	maxBatch: number,
): EmbeddingProviderContribution {
	const readiness = createOpenAIReadiness(baseUrl);
	const local = isLocalHost(new URL(baseUrl).hostname);
	const catalog: EmbeddingModelInfo[] = KNOWN_EMBEDDING_MODELS.map((model) => ({
		id: model.id,
		dimensions: model.dimensions,
		maxBatch,
		local,
	}));
	const endpoint = new URL("embeddings", `${baseUrl.replace(/\/+$/u, "")}/`);

	return {
		id: "openai",
		// The Providers-page display name, shared with the other two kinds.
		label: "OpenAI",
		credentialEnv: "OPENAI_API_KEY",
		models: catalog,
		readiness: () => readiness.readiness(),
		async embed(request: EmbeddingRequest, ctx: EmbeddingContext): Promise<EmbeddingResponse> {
			readiness.noteCredential(ctx.credential);
			if (readiness.publicEndpoint && ctx.credential === undefined) {
				// Core only reaches here when readiness said so; keep a direct
				// caller from sending a placeholder key to the public API.
				throw new Error(`${PREFIX}: no API key (auth.json openai or OPENAI_API_KEY)`);
			}
			try {
				const vectors: number[][] = [];
				for (const batch of splitInputs(request.input, maxBatch, EMBEDDING_REQUEST_TOKEN_BUDGET)) {
					const response = await fetch(endpoint, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							...(ctx.credential === undefined ? {} : { authorization: `Bearer ${ctx.credential}` }),
						},
						body: JSON.stringify({ model: request.model, input: batch }),
						signal: ctx.signal,
					});
					if (!response.ok) {
						const body = await response.text().catch(() => "");
						throw new Error(failureMessage(response.status, body, ctx.credential, batch));
					}
					const payload: unknown = await response.json().catch(() => undefined);
					if (payload === undefined) throw new Error(`${PREFIX} returned an unreadable response`);
					vectors.push(...parseVectors(payload, batch.length));
				}
				readiness.noteSuccess();
				return { vectors };
			} catch (error) {
				// A caller abort is a cancellation, not a failure: the tracker keeps
				// reporting the provider's real health. Core maps its own deadline
				// abort to `timeout`, which likewise says nothing about the endpoint.
				if (!isAbort(error, ctx.signal)) {
					readiness.noteFailure(error instanceof Error ? error.message : String(error));
				}
				throw error;
			}
		},
	};
}
